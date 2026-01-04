/**
 * GM制御ハンドラー
 * 募集終了、議論終了、議論延長など
 */

import { prisma } from '@/lib/prisma';
import { lineClient } from './lineClient';
import { activeRooms, getRoomByLookupId } from './gameState';
import { startVotingPhase } from './phaseHandlers';

/**
 * 募集終了処理（ワンナイト人狼専用）
 * 参加者募集を締め切り、ランダム配分へ移行
 */
export async function handleRecruitmentEnd(event: any): Promise<void> {
  const userId = event.source.userId;
  const groupId = event.source.groupId || event.source.roomId;
  const lookupId = groupId || userId;
  const room = activeRooms.get(lookupId);

  console.log('Recruitment end requested by:', userId, 'groupId:', groupId, 'lookupId:', lookupId, 'roomFound:', !!room);

  if (!room) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: 'エラー：進行中のゲームが見つかりません。先に「ゲーム開始」と送信してください。',
        },
      ],
    });
    return;
  }

  if (room.gmUserId !== userId) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: 'GMのみが募集を終了できます。',
        },
      ],
    });
    return;
  }

  // 参加者数を確認
  const participantCount = room.participants.size;
  console.log('Recruitment ended. Participants:', participantCount);

  // DBに参加者を保存
  const savePromises = Array.from(room.participants).map(async (uid) => {
    try {
      // プロフィール取得を試みるが、失敗してもuserIdで保存
      let displayName = uid;
      try {
        const profile = await lineClient.getProfile(uid);
        displayName = profile.displayName || uid;
      } catch (profileError) {
        console.log('Could not get profile for:', uid, '- using userId as displayName');
      }

      await prisma.player.create({
        data: {
          lineUserId: uid,
          displayName: displayName,
          roomId: room.roomId,
        },
      });
      console.log('Player saved:', uid, displayName);
    } catch (error) {
      console.error('Error saving player:', uid, error);
    }
  });

  await Promise.all(savePromises);

  console.log('Sending start button to GM:', userId);

  // GMにゲーム開始ボタンを送信
  try {
    await lineClient.pushMessage({
      to: userId,
      messages: [
        {
          type: 'text',
          text: `参加者を締め切りました。\n\n現在の参加者は ${participantCount} 名です。\n\nゲームを開始しますか？`,
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'postback',
                  label: 'ゲーム開始',
                  data: `action=auto_assign&roomId=${room.roomId}`,
                  displayText: 'ゲーム開始',
                },
              },
            ],
          },
        },
      ],
    });
  } catch (error: any) {
    console.error('Error sending start button:', error);
    if (error?.status === 429) {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: 'エラー：LINEのメッセージ送信上限に達しました。有料プランへのアップグレードが必要です。',
          },
        ],
      });
      return;
    }
  }

  console.log('Start button sent to GM');
}

/**
 * 議論終了処理（GMのみ）
 * 議論を強制終了し、投票フェーズへ移行
 */
export async function handleDiscussionEnd(event: any): Promise<void> {
  try {
    const userId = event.source.userId;
    const groupId = event.source.groupId || event.source.roomId;
    const lookupId = groupId || userId;

    console.log('Discussion end requested:', { userId, groupId, lookupId });

    // ルームを検索
    const result = getRoomByLookupId(lookupId);
    if (!result) {
      console.log('Room not found for discussion end');
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: 'ルームが見つかりません。',
          },
        ],
      });
      return;
    }

    const { room, key: roomKey } = result;

    console.log('Discussion end - Room search result:', {
      roomFound: true,
      roomStatus: room.status,
      isGM: room.gmUserId === userId
    });

  if (room.status !== 'day') {
    console.log('Not in day phase or room not found - current status:', room.status);
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: `現在は議論フェーズではありません。\n\n現在のステータス: ${room.status}`,
        },
      ],
    });
    return;
  }

  // GMのみが終了できる
  if (room.gmUserId !== userId) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '議論を終了できるのは、GMのみです。',
        },
      ],
    });
    return;
  }

  // すべてのタイマーをキャンセル
  if (room.discussionTimers) {
    room.discussionTimers.forEach((timer: NodeJS.Timeout) => clearTimeout(timer));
    room.discussionTimers = undefined;
    room.discussionEndTime = undefined;
  }

  const targetId = groupId || userId;
  
  console.log('Sending discussion end message to:', targetId);
  
  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: 'text',
        text: 'GMが議論を終了しました。\n\nこれより投票フェーズに移ります。',
      },
    ],
  });

  console.log('Starting voting phase for room:', room.roomId);
  
  // 即座に投票フェーズへ
  startVotingPhase(room.roomId, targetId);
  } catch (error) {
    console.error('Error in handleDiscussionEnd:', error);
  }
}

/**
 * 議論時間延長処理（GMのみ）
 * 議論時間を1分延長する
 */
export async function handleExtendDiscussion(event: any): Promise<void> {
  const userId = event.source.userId;
  const groupId = event.source.groupId || event.source.roomId;
  const lookupId = groupId || userId;

  console.log('Discussion extend requested:', { userId, groupId, lookupId });

  // ルームを検索
  const result = getRoomByLookupId(lookupId);
  if (!result) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: 'ルームが見つかりません。サーバーが再起動された可能性があります。',
        },
      ],
    });
    return;
  }

  const { room, key: roomKey } = result;

  console.log('Extend discussion - Room search result:', {
    roomFound: true,
    roomStatus: room.status,
    isGM: room.gmUserId === userId,
    activeRoomsKeys: Array.from(activeRooms.keys()),
    activeRoomsInfo: Array.from(activeRooms.entries()).map(([k, v]) => ({
      key: k,
      roomId: v.roomId,
      status: v.status,
      gmUserId: v.gmUserId
    }))
  });

  if (room.status !== 'day') {
    console.log('Not in day phase - current status:', room.status);
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: `現在は議論フェーズではありません。\n\n現在のステータス: ${room.status}\n\nルームID: ${room.roomId}\nGM: ${room.gmUserId === userId ? 'あなた' : '他の人'}`,
        },
      ],
    });
    return;
  }

  // GMのみが延長できる
  if (room.gmUserId !== userId) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '議論を延長できるのは、GMのみです。',
        },
      ],
    });
    return;
  }

  // 既存のすべてのタイマーをキャンセル
  if (room.discussionTimers) {
    room.discussionTimers.forEach((timer: NodeJS.Timeout) => clearTimeout(timer));
    room.discussionTimers = [];
  } else {
    room.discussionTimers = [];
  }

  // 終了時刻を1分延長
  const currentTime = Date.now();
  if (!room.discussionEndTime || room.discussionEndTime < currentTime) {
    room.discussionEndTime = currentTime + 60000; // 現在時刻 + 1分
  } else {
    room.discussionEndTime += 60000; // 既存の終了時刻 + 1分
  }

  const remainingTime = Math.ceil((room.discussionEndTime - currentTime) / 1000);
  const targetId = groupId || userId;

  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: 'text',
        text: `議論時間を1分延長しました。\n\n残り時間：約${remainingTime}秒`,
      },
    ],
  });

  // 新しいタイマーをセット
  const timeUntilEnd = room.discussionEndTime - currentTime;
  const votingTimer = setTimeout(() => {
    startVotingPhase(room.roomId, targetId);
  }, timeUntilEnd);
  room.discussionTimers.push(votingTimer);
}

/**
 * 残り時間表示処理
 * 議論フェーズの残り時間を表示
 */
export async function handleShowRemainingTime(event: any): Promise<void> {
  const userId = event.source.userId;
  const groupId = event.source.groupId || event.source.roomId;
  const lookupId = groupId || userId;

  console.log('Remaining time requested:', { userId, groupId, lookupId });

  // ルームを検索
  const result = getRoomByLookupId(lookupId);
  if (!result) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: 'ルームが見つかりません。',
        },
      ],
    });
    return;
  }

  const { room } = result;

  if (room.status !== 'day') {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '現在は議論フェーズではありません。',
        },
      ],
    });
    return;
  }

  // 残り時間を計算
  const currentTime = Date.now();
  if (!room.discussionEndTime) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '議論時間の情報が見つかりません。',
        },
      ],
    });
    return;
  }

  const remainingMs = room.discussionEndTime - currentTime;
  
  if (remainingMs <= 0) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '議論時間は終了しました。まもなく投票フェーズに移行します。',
        },
      ],
    });
    return;
  }

  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);

  let timeText = '';
  if (remainingMinutes > 0) {
    timeText = `${remainingMinutes}分${remainingSeconds}秒`;
  } else {
    timeText = `${remainingSeconds}秒`;
  }

  await lineClient.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `⏰ 残り時間: ${timeText}`,
      },
    ],
  });

  console.log('Remaining time shown:', timeText);
}
