/**
 * 役職割り当てハンドラー（ワンナイト人狼専用）
 * 役職をランダム配分してゲームを開始
 */

import { prisma } from '@/lib/prisma';
import { lineClient, isDummyPlayer } from './lineClient';
import { activeRooms, roleAssignments, getRoomByRoomId } from './gameState';
import { getRoleDistribution, assignRolesToPlayers, getRoleDescription } from '@/lib/roleDistribution';
import { startNightPhase } from './phaseHandlers';

/**
 * ランダム配分処理（ワンナイト人狼）
 * 参加者数に応じた役職をランダム配分し、ゲームを開始
 * @param event イベント
 * @param roomId ルームID
 */
export async function handleAutoAssign(
  event: any,
  roomId: string
): Promise<void> {
  const userId = event.source.userId;
  const groupId = event.source.groupId || event.source.roomId;
  
  // roomIdでルームを検索
  const result = getRoomByRoomId(roomId);
  if (!result) {
    console.log('Room not found for auto assign');
    return;
  }

  const { room, key: roomKey } = result;

  console.log('Auto assign:', { userId, roomId, roomFound: true, roomKey });

  if (room.gmUserId !== userId) {
    console.log('User is not GM');
    return;
  }

  const participantCount = room.participants.size;
  console.log('Auto assign started:', { roomId, participantCount });

  // 役職配分を取得
  const distribution = getRoleDistribution(participantCount);
  if (!distribution) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: `エラー：${participantCount}人でのワンナイト人狼はサポートされていません。（3～8人のみ対応）`,
        },
      ],
    });
    return;
  }

  // 役職をランダムに割り当て
  const userIds = Array.from(room.participants) as string[];
  const { assignments: roleAssignment, fieldCards } = assignRolesToPlayers(userIds, distribution);

  console.log('Role assignments:', roleAssignment);
  console.log('Field cards:', fieldCards);

  // 場札を保存（ワンナイトモード用）
  room.fieldCards = fieldCards;

  // DBに役職を保存
  for (const [uid, role] of roleAssignment.entries()) {
    await prisma.player.updateMany({
      where: {
        lineUserId: uid,
        roomId: room.roomId,
      },
      data: {
        role: role,
      },
    });
  }

  // Roomのステータスを更新
  await prisma.room.update({
    where: { id: room.roomId },
    data: {
      mode: 'onenight',
      status: 'in_game',
    },
  });

  room.status = 'night';

  // 役職情報を保存
  roleAssignments.set(room.roomId, roleAssignment);

  // グループ全体に開始メッセージ
  // 送信先を決定（グループがあればグループ、なければGM個人）
  const targetId = roomKey || userId;

  // 使用カードの構成を作成
  const cardCounts = new Map<string, number>();
  for (const role of Object.keys(distribution)) {
    cardCounts.set(role, distribution[role]);
  }
  const totalCards = Object.values(distribution).reduce((a: number, b) => a + (b as number), 0);
  const compositionList = Array.from(cardCounts.entries())
    .map(([role, count]) => `${role}×${count}`)
    .join('、');
  const cardCompositionText = `\n\n【 使用カード構成 】\n合計 ${totalCards} 枚: ${compositionList}\n（${participantCount}人に配布、残り${fieldCards.length}枚は場札）`;
  
  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: 'text',
        text: `...参加者の確認が完了しました。\n\nこれより、ワンナイト人狼 (参加者 ${participantCount} 名) を開始します。${cardCompositionText}\n\n皆さんの役職は、個別のメッセージでお送りしました。\n\n他の人に見られないよう、こっそりと確認してください。\n\nそれでは、運命の一夜が訪れます……。`,
      },
    ],
  });

  // 各参加者に役職を個別通知（ダミーを除く）
  for (const [uid, role] of roleAssignment.entries()) {
    // ダミープレイヤーにはメッセージを送信しない
    if (isDummyPlayer(uid)) {
      console.log('Skipping message to dummy player:', uid, role);
      continue;
    }
    
    const roleDesc = getRoleDescription(role);
    
    await lineClient.pushMessage({
      to: uid,
      messages: [
        {
          type: 'text',
          text: `あなたの役職は 【${role}】 です。\n\n● チーム: ${roleDesc.team}\n● 勝利条件: ${roleDesc.winCondition}\n● 能力: ${roleDesc.ability}`,
        },
      ],
    });
  }

  console.log('Role assignments sent to all players');

  // 夜フェーズ開始
  setTimeout(() => {
    startNightPhase(room.roomId, targetId, roleAssignment);
  }, 3000); // 3秒後に夜フェーズ開始
}
