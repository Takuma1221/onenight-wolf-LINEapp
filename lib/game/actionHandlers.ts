/**
 * アクションハンドラー
 * 占い、投票などのゲーム内アクションを処理
 */

import { prisma } from '@/lib/prisma';
import { lineClient, isDummyPlayer } from './lineClient';
import { activeRooms, roleAssignments, getRoomByRoomId } from './gameState';
import { Role } from '@/lib/roleDistribution';
import { startDayPhase } from './phaseHandlers';
import { showVoteResults } from './resultHandlers';

/**
 * 占い処理
 * 占い師が対象を占い、結果を通知する
 * @param event イベント
 * @param roomId ルームID
 * @param fortuneTellerId 占い師のユーザーID
 * @param targetId 占い対象のユーザーID
 */
export async function handleDivine(
  event: any,
  roomId: string,
  fortuneTellerId: string,
  targetId: string
): Promise<void> {
  console.log('Divine action:', { roomId, fortuneTellerId, targetId });

  // roomIdでルームと役職情報を取得
  const result = getRoomByRoomId(roomId);
  if (!result) {
    console.log('Room not found for divine');
    return;
  }

  const { room, key: roomKey } = result;

  const roles = roleAssignments.get(roomId);
  if (!roles) {
    console.log('Roles not found for room');
    return;
  }

  // 対象の役職を確認
  const targetRole = roles.get(targetId);
  const isWerewolf = targetRole === '人狼';

  // 対象の表示名を取得
  const targetPlayer = await prisma.player.findFirst({
    where: {
      roomId: roomId,
      lineUserId: targetId,
    },
    select: {
      displayName: true,
    },
  });

  const targetName = targetPlayer?.displayName || targetId.substring(0, 10);

  // 夜フェーズのタイマーをキャンセル（占い師が行動したので）
  if (room.nightTimer) {
    clearTimeout(room.nightTimer);
    room.nightTimer = undefined;
    console.log('Night timer cancelled - fortune teller acted');
  }

  // 占い結果を占い師に通知（ダミーを除く）
  if (!isDummyPlayer(fortuneTellerId)) {
    // 実プレイヤーの場合
    if (event.replyToken) {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: `占いの結果が出ました。\n\n${targetName} さんを占った結果……\n\n【${isWerewolf ? '人狼である' : '人狼ではない'}】 ことがわかりました。`,
          },
        ],
      });
    } else {
      // replyTokenがない場合はpushMessage
      await lineClient.pushMessage({
        to: fortuneTellerId,
        messages: [
          {
            type: 'text',
            text: `占いの結果が出ました。\n\n${targetName} さんを占った結果……\n\n【${isWerewolf ? '人狼である' : '人狼ではない'}】 ことがわかりました。`,
          },
        ],
      });
    }
  } else {
    console.log('Dummy fortune teller divine - skipping message');
  }

  // 朝フェーズへ移行（少し待ってから）
  setTimeout(() => {
    startDayPhase(roomId, roomKey || fortuneTellerId);
  }, isDummyPlayer(fortuneTellerId) ? 1000 : 5000); // ダミーは1秒、実プレイヤーは5秒待つ
}

/**
 * 投票処理
 * プレイヤーの投票を記録し、全員投票完了したら結果を表示
 * @param event イベント
 * @param roomId ルームID
 * @param voterId 投票者のユーザーID
 * @param targetId 投票先のユーザーID（または'PEACE_VILLAGE'）
 */
export async function handleVote(
  event: any,
  roomId: string,
  voterId: string,
  targetId: string
): Promise<void> {
  console.log('Vote action:', { roomId, voterId, targetId });

  // デバッグ: activeRoomsの内容を確認
  console.log('Active rooms:', Array.from(activeRooms.entries()).map(([k, v]) => ({ 
    key: k, 
    roomId: v.roomId, 
    status: v.status,
    participantCount: v.participants.size 
  })));

  // roomIdでルームを取得
  const result = getRoomByRoomId(roomId);
  let room = result?.room;
  let roomKey = result?.key;

  // メモリになければDBから復元を試みる
  if (!room) {
    console.log('Room not found in memory. Attempting to restore from DB...');
    
    try {
      const dbRoom = await prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!dbRoom || dbRoom.status === 'finished') {
        console.log('Room not found in DB or already finished:', roomId);
        if (event.replyToken) {
          await lineClient.replyMessage({
            replyToken: event.replyToken,
            messages: [
              {
                type: 'text',
                text: 'ゲームが見つかりません。既に終了しているか、サーバーが再起動された可能性があります。',
              },
            ],
          });
        }
        return;
      }

      // プレイヤー情報を取得
      const players = await prisma.player.findMany({
        where: { roomId: roomId },
      });

      // roomKeyを特定（投票は個別DMで送られてくるため、voterIdをフォールバックとして使用）
      roomKey = voterId;

      // メモリに復元
      const participants = new Set(players.map(p => p.lineUserId));
      room = {
        roomId: dbRoom.id,
        gmUserId: players[0]?.lineUserId || voterId,
        participants: participants,
        status: 'voting',
        votes: new Map(),
      };
      if (roomKey) {
        activeRooms.set(roomKey, room);
      }

      // roleAssignmentsも復元
      const roleMap = new Map<string, Role>();
      for (const player of players) {
        if (player.role) {
          roleMap.set(player.lineUserId, player.role as Role);
        }
      }
      roleAssignments.set(roomId, roleMap);

      console.log('Room restored from DB:', {
        roomId,
        participants: participants.size,
        roles: roleMap.size,
      });

    } catch (error) {
      console.error('Error restoring room from DB:', error);
      if (event.replyToken) {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: 'text',
              text: 'ゲーム情報の取得に失敗しました。',
            },
          ],
        });
      }
      return;
    }
  }

  if (!room) {
    console.log('Room not found for vote. Looking for roomId:', roomId);
    return;
  }

  // 投票を記録
  if (!room.votes) {
    room.votes = new Map();
  }
  room.votes.set(voterId, targetId);

  // 確認メッセージ（ダミー以外）
  if (event.replyToken && !isDummyPlayer(voterId)) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '投票を受け付けました。',
        },
      ],
    });
  }

  // DBに投票を保存
  try {
    await prisma.vote.create({
      data: {
        roomId: roomId,
        voter: voterId,
        target: targetId,
      },
    });
  } catch (error) {
    console.error('Error saving vote:', error);
  }

  const roles = roleAssignments.get(roomId);
  if (!roles) {
    console.error('No roles found for vote check:', roomId);
    return;
  }

  // 全員が投票したかチェック
  if (room.votes.size === roles.size) {
    console.log('All players voted, showing results');
    // 全員投票完了！結果発表
    setTimeout(() => {
      // グループIDがあればそれを使う、なければroomKeyを使う
      const sendTo = room!.groupId || roomKey || voterId;
      console.log('Sending results to:', sendTo, '(groupId:', room!.groupId, 'roomKey:', roomKey, ')');
      showVoteResults(roomId, sendTo);
    }, 1000);
  }
}
