/**
 * 結果表示ハンドラー
 * 投票結果、最終結果、平和村結果などを表示
 */

import { prisma } from '@/lib/prisma';
import { lineClient } from './lineClient';
import { activeRooms, roleAssignments, getRoomByRoomId } from './gameState';
import { Role } from '@/lib/roleDistribution';

/**
 * 投票結果を表示
 * 得票数を集計し、最多得票者を特定
 * @param roomId ルームID
 * @param targetId メッセージ送信先ID
 */
export async function showVoteResults(roomId: string, targetId: string): Promise<void> {
  console.log('Showing vote results for room:', roomId);

  const result = getRoomByRoomId(roomId);
  if (!result || !result.room.votes) {
    console.error('Room or votes not found');
    return;
  }

  const { room } = result;
  const roles = roleAssignments.get(roomId);
  if (!roles) {
    console.error('Roles not found for results');
    return;
  }

  // プレイヤーの表示名をDBから取得
  const players = await prisma.player.findMany({
    where: {
      roomId: roomId,
    },
    select: {
      lineUserId: true,
      displayName: true,
    },
  });

  const playerMap = new Map(players.map(p => [p.lineUserId, p.displayName]));

  // 得票数を集計
  const voteCounts = new Map<string, number>();
  if (room.votes) {
    for (const target of room.votes.values()) {
      voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
    }
  }

  // 平和村の得票数
  const peaceVillageVotes = voteCounts.get('PEACE_VILLAGE') || 0;

  // 結果テキスト作成
  let resultText = '全員の投票が完了しました。\n\n投票の結果を発表します。\n\n';
  for (const [uid, role] of roles.entries()) {
    const votes = voteCounts.get(uid) || 0;
    const name = playerMap.get(uid) || uid.substring(0, 10);
    resultText += `● ${name}: ${votes}票\n`;
  }
  
  // 平和村の票も表示
  if (peaceVillageVotes > 0) {
    resultText += `● 平和村（誰も追放しない）: ${peaceVillageVotes}票\n`;
  }

  // 最多得票者を特定
  let maxVotes = 0;
  let expelled: string[] = [];
  
  for (const [uid, votes] of voteCounts.entries()) {
    if (votes > maxVotes) {
      maxVotes = votes;
      expelled = [uid];
    } else if (votes === maxVotes) {
      expelled.push(uid);
    }
  }

  // 平和村が最多得票の場合
  if (expelled.length > 0 && expelled[0] === 'PEACE_VILLAGE') {
    resultText += `\n最も多くの票を集めたのは「平和村」でした。\n\n誰も追放されません。`;
    
    await lineClient.pushMessage({
      to: targetId,
      messages: [
        {
          type: 'text',
          text: resultText,
        },
      ],
    });

    // 平和村投票の結果発表
    setTimeout(() => {
      showPeaceVillageResult(roomId, targetId);
    }, 3000);
    return;
  }

  // 最多得票が0票の場合、または追放者が決まらない場合
  if (maxVotes === 0 || expelled.length === 0) {
    expelled = [Array.from(roles.keys())[0]]; // 簡易実装：最初の人を追放
  }

  const expelledId = expelled[0]; // 同数の場合は最初の人
  const expelledRole = roles.get(expelledId);
  const expelledName = playerMap.get(expelledId) || expelledId.substring(0, 10);

  resultText += `\n最も多くの票を集めた ${expelledName} が、追放されることとなりました。`;

  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  });

  // 勝敗判定と結果発表
  setTimeout(() => {
    showFinalResults(roomId, targetId, expelledId, expelledRole || '市民');
  }, 3000);
}

/**
 * 平和村投票の結果発表
 * 誰も追放しない選択が最多だった場合の処理
 * @param roomId ルームID
 * @param targetId メッセージ送信先ID
 */
async function showPeaceVillageResult(roomId: string, targetId: string): Promise<void> {
  console.log('Showing peace village result for room:', roomId);

  const roles = roleAssignments.get(roomId);
  if (!roles) {
    console.error('Roles not found for peace village result');
    return;
  }

  // ルーム情報を取得（場札を確認するため）
  const result = getRoomByRoomId(roomId);
  const room = result?.room;

  // プレイヤーの表示名をDBから取得
  const players = await prisma.player.findMany({
    where: {
      roomId: roomId,
    },
    select: {
      lineUserId: true,
      displayName: true,
    },
  });

  const playerMap = new Map(players.map(p => [p.lineUserId, p.displayName]));

  // 場札に人狼がいるかチェック
  const fieldHasWerewolf = room?.fieldCards?.includes('人狼') || false;
  
  // プレイヤーの中に人狼がいるかチェック
  let werewolfExists = false;
  for (const role of roles.values()) {
    if (role === '人狼') {
      werewolfExists = true;
      break;
    }
  }

  console.log('Peace village check:', {
    fieldHasWerewolf,
    werewolfExists,
    fieldCards: room?.fieldCards,
    playerRoles: Array.from(roles.values())
  });

  // 勝敗判定
  let winnerTeam: string;
  let winnerEmoji: string;
  let resultMessage: string;

  if (!werewolfExists && fieldHasWerewolf) {
    // 平和村判定が正解（プレイヤーに人狼なし、場札に人狼あり）
    winnerTeam = '市民チーム';
    winnerEmoji = '🎉';
    resultMessage = `判定は正解でした！\n\n実は今回、人狼は場札に紛れていました。\n参加者の中に人狼はいなかったのです！\n\n（これを「平和村」と呼びます）\n\nよって……\n\n${winnerEmoji}【 ${winnerTeam} 】の勝利です！ ${winnerEmoji}\n\n`;
  } else {
    // 平和村判定が間違い（実際にはプレイヤーに人狼がいた）
    winnerTeam = '人狼チーム';
    winnerEmoji = '🐺';
    resultMessage = `判定は間違っていました！\n\n実は、参加者の中に人狼が潜んでいました……。\n\n誰も追放されなかったため……\n\n${winnerEmoji}【 ${winnerTeam} 】の勝利です！ ${winnerEmoji}\n\n`;
  }

  // 全役職公開
  resultMessage += '\n...今回のゲームの答え合わせです。\n\n【 ゲーム結果 (全役職公開) 】\n\n';
  for (const [uid, role] of roles.entries()) {
    const name = playerMap.get(uid) || uid.substring(0, 10);
    resultMessage += `● ${name}: ${role}\n`;
  }

  // 場札も表示
  if (room?.fieldCards && room.fieldCards.length > 0) {
    resultMessage += `\n【 場札 】\n${room.fieldCards.map((card: Role) => `● ${card}`).join('\n')}\n`;
  }

  resultMessage += '\n\nみなさん、お疲れ様でした！\n\n「ゲーム開始」と送ると、次のゲームを始められます。';

  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: 'text',
        text: resultMessage,
      },
    ],
  });

  // ルームのステータスを finished に更新
  if (room) {
    room.status = 'finished';
  }

  // DBのステータスを更新
  await prisma.room.update({
    where: { id: roomId },
    data: { status: 'finished' },
  });

  console.log('Peace village result announced');
}

/**
 * 最終結果発表
 * 追放者と勝敗を発表し、全役職を公開
 * @param roomId ルームID
 * @param targetId メッセージ送信先ID
 * @param expelledId 追放されたプレイヤーのID
 * @param expelledRole 追放されたプレイヤーの役職
 */
async function showFinalResults(
  roomId: string,
  targetId: string,
  expelledId: string,
  expelledRole: Role
): Promise<void> {
  console.log('Showing final results for room:', roomId);

  const roles = roleAssignments.get(roomId);
  if (!roles) {
    console.error('Roles not found for final results');
    return;
  }

  // ルーム情報を取得（場札を確認するため）
  const result = getRoomByRoomId(roomId);
  const room = result?.room;

  // プレイヤーの表示名をDBから取得
  const players = await prisma.player.findMany({
    where: {
      roomId: roomId,
    },
    select: {
      lineUserId: true,
      displayName: true,
    },
  });

  const playerMap = new Map(players.map(p => [p.lineUserId, p.displayName]));

  // 場札に人狼がいるかチェック（平和村判定）
  const fieldHasWerewolf = room?.fieldCards?.includes('人狼') || false;
  
  // プレイヤーの中に人狼がいるかチェック
  let werewolfExists = false;
  for (const role of roles.values()) {
    if (role === '人狼') {
      werewolfExists = true;
      break;
    }
  }

  // 勝敗判定
  let winnerTeam: string;
  let winnerEmoji: string;
  let resultMessage: string;

  if (!werewolfExists && fieldHasWerewolf) {
    // 平和村（人狼が場札にいた）
    winnerTeam = '市民チーム';
    winnerEmoji = '🎉';
    resultMessage = `追放されたのは ${playerMap.get(expelledId) || expelledId} でした。\n\nそして、その役職は…… 【 ${expelledRole} 】 でした！\n\n実は今回、人狼は場札に紛れていました。\n参加者の中に人狼はいなかったのです！\n\n（これを「平和村」と呼びます）\n\nよって……\n\n${winnerEmoji}【 ${winnerTeam} 】の勝利です！ ${winnerEmoji}\n\n`;
  } else {
    // 通常の勝敗判定
    const isWerewolfExpelled = expelledRole === '人狼';
    winnerTeam = isWerewolfExpelled ? '市民チーム' : '人狼チーム';
    winnerEmoji = isWerewolfExpelled ? '🎉' : '🐺';
    
    const expelledName = playerMap.get(expelledId) || expelledId.substring(0, 10);
    resultMessage = `追放されたのは ${expelledName} でした。\n\nそして、${expelledName} の役職は…… 【 ${expelledRole} 】 でした！\n\nよって……\n\n${winnerEmoji}【 ${winnerTeam} 】の勝利です！ ${winnerEmoji}\n\n`;
  }

  // 全役職公開
  resultMessage += '\n...今回のゲームの答え合わせです。\n\n【 ゲーム結果 (全役職公開) 】\n\n';
  for (const [uid, role] of roles.entries()) {
    const expelled = uid === expelledId ? ' (追放)' : '';
    const name = playerMap.get(uid) || uid.substring(0, 10);
    resultMessage += `● ${name}: ${role}${expelled}\n`;
  }

  // 場札も表示
  if (room?.fieldCards && room.fieldCards.length > 0) {
    resultMessage += `\n【 場札 】\n${room.fieldCards.map((card: Role) => `● ${card}`).join('\n')}\n`;
  }

  resultMessage += '\n\nみなさん、お疲れ様でした！\n\n「ゲーム開始」と送ると、次のゲームを始められます。';

  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: 'text',
        text: resultMessage,
      },
    ],
  });

  // ルームのステータスを finished に更新
  if (room) {
    room.status = 'finished';
  }

  // DBのステータスを更新
  await prisma.room.update({
    where: { id: roomId },
    data: { status: 'finished' },
  });

  console.log('Final results announced');
}
