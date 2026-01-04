/**
 * ゲーム開始・募集・終了ハンドラー
 */

import { prisma } from '@/lib/prisma';
import { lineClient, isDummyPlayer, generateDummyName } from './lineClient';
import { activeRooms, roleAssignments, removeRoom } from './gameState';

/**
 * 通常のゲーム開始処理
 * 参加者募集を開始する
 */
export async function handleGameStart(event: any): Promise<void> {
  const userId = event.source.userId;
  const groupId = event.source.groupId || event.source.roomId;
  const lookupId = groupId || userId;
  
  console.log('Game start requested by:', userId, 'groupId:', groupId, 'lookupId:', lookupId);

  // 既存のルームがあるかチェック
  const existingRoom = activeRooms.get(lookupId);
  if (existingRoom && existingRoom.status !== 'finished') {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: `既にゲームが進行中です。(現在: ${existingRoom.status})\n\n先に「ゲーム終了」と送ってから、新しいゲームを開始してください。`,
        },
      ],
    });
    console.log('Game already in progress, ignoring new game start');
    return;
  }

  // 古いルームデータをクリーンアップ
  if (existingRoom) {
    console.log('Cleaning up old room:', existingRoom.roomId);
    activeRooms.delete(lookupId);
    roleAssignments.delete(existingRoom.roomId);
  }

  // 新しいルームを作成
  const roomId = `room_${Date.now()}`;
  activeRooms.set(lookupId, {
    roomId,
    groupId: groupId,
    gmUserId: userId,
    participants: new Set([userId]),
    status: 'recruiting',
  });

  // DBにルーム作成
  await prisma.room.create({
    data: {
      id: roomId,
      mode: 'not_selected',
      status: 'recruiting',
    },
  });

  console.log('Room created:', roomId);

  // 参加ボタン付きメッセージを送信
  if (event.replyToken) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'template',
          altText: '参加者募集中！',
          template: {
            type: 'buttons',
            text: 'これより、ゲームの参加者を募集します。\n\n参加する方は [ 参加する ] ボタンを押してください。\n\nGMは、全員が押し終わったら「募集終了」と送信してください。',
            actions: [
              {
                type: 'postback',
                label: '参加する',
                data: `action=join&roomId=${roomId}`,
                displayText: '参加します！',
              },
            ],
          },
        },
      ],
    });
  }
}

/**
 * テスト用ゲーム開始処理（ダミープレイヤー付き）
 * 開発・テスト用に1人でゲームをテストできる
 */
export async function handleTestGameStart(event: any, text: string): Promise<void> {
  const userId = event.source.userId;
  const groupId = event.source.groupId || event.source.roomId;
  const lookupId = groupId || userId;

  console.log('Test game start requested by:', userId);

  // 既存のルームがあるかチェック
  const existingRoom = activeRooms.get(lookupId);
  if (existingRoom && existingRoom.status !== 'finished') {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: `既にゲームが進行中です。\n先に「ゲーム終了」と送ってください。`,
        },
      ],
    });
    return;
  }

  // プレイヤー数を取得（デフォルト3人）
  const match = text.match(/テスト開始\s+(\d+)/);
  const dummyCount = match ? Math.max(2, Math.min(7, parseInt(match[1]) - 1)) : 2; // 実ユーザー1人+ダミー
  const totalPlayers = dummyCount + 1;

  // 新しいルームを作成
  const roomId = `room_${Date.now()}`;
  const participants = new Set([userId]);
  
  // ダミープレイヤーを追加
  const dummyUsers: string[] = [];
  for (let i = 0; i < dummyCount; i++) {
    const dummyId = `dummy_${roomId}_${i}`;
    participants.add(dummyId);
    dummyUsers.push(dummyId);
  }

  activeRooms.set(lookupId, {
    roomId,
    groupId: groupId,
    gmUserId: userId,
    participants,
    status: 'recruiting',
  });

  // DBにルームを保存
  await prisma.room.create({
    data: {
      id: roomId,
      mode: 'onenight',
      status: 'recruiting',
    },
  });

  // プレイヤーをDBに保存
  const playersToCreate = [
    {
      lineUserId: userId,
      displayName: 'あなた',
      roomId,
    },
    ...dummyUsers.map((dummyId, i) => ({
      lineUserId: dummyId,
      displayName: generateDummyName(i),
      roomId,
    })),
  ];

  await prisma.player.createMany({
    data: playersToCreate,
  });

  console.log('Test game created with', totalPlayers, 'players (1 real +', dummyCount, 'dummies)');

  // ランダム配分ボタンを送信（GMに）
  await lineClient.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `🎮 テストモードでワンナイト人狼を開始しました！\n\n参加者: ${totalPlayers}人\n・あなた\n${dummyUsers.map((_, i) => `・${generateDummyName(i)}`).join('\n')}\n\nゲームを開始しますか？`,
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'postback',
                label: 'ゲーム開始',
                data: `action=auto_assign&roomId=${roomId}`,
                displayText: 'ゲーム開始',
              },
            },
          ],
        },
      },
    ],
  });
}

/**
 * ダミープレイヤー追加処理
 * 募集中にダミープレイヤーを追加できる（GMのみ）
 */
export async function handleAddDummies(event: any, text: string): Promise<void> {
  const userId = event.source.userId;
  const groupId = event.source.groupId || event.source.roomId;
  const lookupId = groupId || userId;

  const room = activeRooms.get(lookupId);
  if (!room || room.status !== 'recruiting') {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '参加募集中のゲームがありません。',
        },
      ],
    });
    return;
  }

  // GMのみが追加できる
  if (room.gmUserId !== userId) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: 'ダミーを追加できるのはGMのみです。',
        },
      ],
    });
    return;
  }

  // 追加人数を取得（デフォルト1人）
  const match = text.match(/ダミー追加\s+(\d+)/);
  const count = match ? Math.max(1, Math.min(7, parseInt(match[1]))) : 1;

  // 現在の参加者数をチェック
  const currentCount = room.participants.size;
  if (currentCount + count > 8) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: `参加者は最大8人までです。\n現在: ${currentCount}人\n追加可能: ${8 - currentCount}人`,
        },
      ],
    });
    return;
  }

  // ダミープレイヤーを追加
  const dummyUsers: { id: string; name: string }[] = [];
  const existingDummies = Array.from(room.participants)
    .filter(id => isDummyPlayer(id))
    .length;

  for (let i = 0; i < count; i++) {
    const dummyId = `dummy_${room.roomId}_${existingDummies + i}`;
    const dummyName = generateDummyName(existingDummies + i);
    room.participants.add(dummyId);
    dummyUsers.push({ id: dummyId, name: dummyName });

    // DBに保存
    await prisma.player.create({
      data: {
        lineUserId: dummyId,
        displayName: dummyName,
        roomId: room.roomId,
      },
    });
  }

  console.log('Added', count, 'dummy players to room:', room.roomId);

  const targetId = groupId || userId;
  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: 'text',
        text: `✅ ダミープレイヤーを${count}人追加しました！\n\n${dummyUsers.map(d => `・${d.name}`).join('\n')}\n\n現在の参加者: ${room.participants.size}人`,
      },
    ],
  });
}

/**
 * ゲーム終了処理（GMのみ）
 * 進行中のゲームを強制終了する
 */
export async function handleGameEnd(event: any): Promise<void> {
  const userId = event.source.userId;
  const groupId = event.source.groupId || event.source.roomId;
  const lookupId = groupId || userId;

  console.log('Game end requested:', { userId, groupId, lookupId });

  // ルームを検索
  const room = activeRooms.get(lookupId);
  if (!room) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: 'アクティブなゲームが見つかりません。',
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
          text: 'ゲームを終了できるのは、GMのみです。',
        },
      ],
    });
    return;
  }

  // タイマーをキャンセル
  if (room.nightTimer) {
    clearTimeout(room.nightTimer);
  }
  if (room.discussionTimers) {
    room.discussionTimers.forEach(timer => clearTimeout(timer));
  }

  const roomId = room.roomId;
  
  // DBを更新
  await prisma.room.update({
    where: { id: roomId },
    data: { status: 'finished' },
  });

  // メモリから削除
  removeRoom(roomId);

  const targetId = groupId || userId;
  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: 'text',
        text: 'ゲームを強制終了しました。\n\nお疲れ様でした。\n\n「ゲーム開始」と送ると、新しいゲームを始められます。',
      },
    ],
  });

  console.log('Game ended successfully');
}
