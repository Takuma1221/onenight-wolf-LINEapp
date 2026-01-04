/**
 * ゲームフェーズハンドラー
 * 夜フェーズ、朝（議論）フェーズ、投票フェーズを管理
 */

import { prisma } from '@/lib/prisma';
import { lineClient, isDummyPlayer } from './lineClient';
import { activeRooms, roleAssignments, getRoomByRoomId } from './gameState';
import { Role } from '@/lib/roleDistribution';
// 循環依存を避けるため、handleVoteは動的インポート

/**
 * 夜フェーズを開始
 * 怪盗→占い師の順で行動を処理（各15秒、合計30秒）
 * @param roomId ルームID
 * @param targetId メッセージ送信先ID
 * @param roles 役職マップ
 */
export async function startNightPhase(
  roomId: string,
  targetId: string,
  roles: Map<string, Role>
): Promise<void> {
  console.log('Starting night phase for room:', roomId, 'targetId:', targetId);

  // グループに夜の通知
  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: 'text',
        text: '...静かな夜が訪れました。\n\n能力を持つ者がいれば、行動を開始してください。\n\n夜は30秒間続きます。',
      },
    ],
  });

  // 怪盗と占い師を探す（元の役職を記録）
  let thiefId: string | null = null;
  let fortuneTellerId: string | null = null;
  const otherPlayers: string[] = [];

  for (const [uid, role] of roles.entries()) {
    if (role === '怪盗') {
      thiefId = uid;
    } else if (role === '占い師') {
      fortuneTellerId = uid;
    } else {
      otherPlayers.push(uid);
    }
  }

  // 元の怪盗と占い師のIDをroomに保存
  const roomResult = getRoomByRoomId(roomId);
  if (roomResult) {
    roomResult.room.originalThiefId = thiefId || undefined;
    roomResult.room.originalFortuneTellerId = fortuneTellerId || undefined;
  }

  // 怪盗の処理を開始（最初の15秒）
  if (thiefId) {
    await handleThiefPhase(roomId, targetId, thiefId, roles, otherPlayers);
  }

  // 15秒後に占い師の処理を開始（元の占い師を使用）
  setTimeout(async () => {
    if (fortuneTellerId) {
      await handleFortuneTellerPhase(roomId, targetId, fortuneTellerId, roles, otherPlayers);
    }
  }, 15000);

  // 怪盗も占い師もいない場合、全員に待機メッセージ
  if (!thiefId && !fortuneTellerId) {
    for (const [uid, role] of roles.entries()) {
      if (!isDummyPlayer(uid)) {
        await lineClient.pushMessage({
          to: uid,
          messages: [
            {
              type: 'text',
              text: `あなたは 【${role}】 です。\n\n静かに朝が訪れるのを待ってください……。`,
            },
          ],
        });
      }
    }
  } else {
    // 怪盗でも占い師でもないプレイヤーに待機メッセージ
    for (const [uid, role] of roles.entries()) {
      if (role !== '怪盗' && role !== '占い師' && !isDummyPlayer(uid)) {
        await lineClient.pushMessage({
          to: uid,
          messages: [
            {
              type: 'text',
              text: `あなたは 【${role}】 です。\n\n静かに朝が訪れるのを待ってください……。`,
            },
          ],
        });
      }
    }
  }

  // 30秒後に朝フェーズへ移行
  console.log('Setting night timer for 30 seconds...');
  const nightTimer = setTimeout(() => {
    console.log('Night timer expired - moving to day phase');
    startDayPhase(roomId, targetId);
  }, 30000);

  // タイマーをroomに保存
  if (roomResult) {
    roomResult.room.nightTimer = nightTimer;
  }
}

/**
 * 怪盗フェーズの処理（最初の15秒）
 */
async function handleThiefPhase(
  roomId: string,
  targetId: string,
  thiefId: string,
  roles: Map<string, Role>,
  otherPlayers: string[]
): Promise<void> {
  console.log('Starting thief phase:', thiefId);

  // ダミー怪盗は自動で交換
  if (isDummyPlayer(thiefId)) {
    const target = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
    console.log('Dummy thief auto-swap:', thiefId, '->', target);
    
    const { handleThiefSwap } = await import('./actionHandlers');
    setTimeout(() => {
      handleThiefSwap({ source: { userId: thiefId } }, roomId, thiefId, target);
    }, Math.random() * 3000 + 2000);
    
    return;
  }

  // プレイヤーの表示名をDBから取得
  const players = await prisma.player.findMany({
    where: {
      roomId: roomId,
      lineUserId: { in: otherPlayers },
    },
    select: {
      lineUserId: true,
      displayName: true,
    },
  });

  const playerMap = new Map(players.map(p => [p.lineUserId, p.displayName]));

  const actions = otherPlayers.map((uid) => ({
    type: 'postback' as const,
    label: (playerMap.get(uid) || uid.substring(0, 10)) + ' と交換',
    data: `action=thief_swap&roomId=${roomId}&target=${uid}`,
    displayText: '交換しました',
  }));

  await lineClient.pushMessage({
    to: thiefId,
    messages: [
      {
        type: 'text',
        text: 'あなたは 【怪盗】 です。\n\n今宵、役職を交換する相手を1人選んでください。\n\n交換後の役職が通知されます。\n\n（15秒以内に選択してください）',
        quickReply: {
          items: actions.map((action) => ({
            type: 'action' as const,
            action,
          })),
        },
      },
    ],
  });
}

/**
 * 占い師フェーズの処理（後半の15秒）
 * 元の占い師（交換されていても）が占いを実行
 */
async function handleFortuneTellerPhase(
  roomId: string,
  targetId: string,
  originalFortuneTellerId: string,
  roles: Map<string, Role>,
  otherPlayers: string[]
): Promise<void> {
  console.log('Starting fortune teller phase. Original fortune teller:', originalFortuneTellerId);

  // 現在の役職を確認（怪盗と交換されていれば変わっている）
  const currentRole = roles.get(originalFortuneTellerId);
  console.log('Original fortune teller current role:', currentRole);

  // ダミー占い師は自動で占い
  if (isDummyPlayer(originalFortuneTellerId)) {
    const target = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
    console.log('Dummy fortune teller auto-divine:', originalFortuneTellerId, '->', target);
    
    const { handleDivine } = await import('./actionHandlers');
    setTimeout(() => {
      handleDivine({ source: { userId: originalFortuneTellerId } }, roomId, originalFortuneTellerId, target);
    }, Math.random() * 3000 + 2000);
    
    return;
  }

  // プレイヤーの表示名をDBから取得
  const players = await prisma.player.findMany({
    where: {
      roomId: roomId,
      lineUserId: { in: otherPlayers },
    },
    select: {
      lineUserId: true,
      displayName: true,
    },
  });

  const playerMap = new Map(players.map(p => [p.lineUserId, p.displayName]));

  // 元の占い師が占える対象（自分以外）
  const divineTargets = otherPlayers.filter(uid => uid !== originalFortuneTellerId);

  const actions = divineTargets.map((uid) => ({
    type: 'postback' as const,
    label: (playerMap.get(uid) || uid.substring(0, 10)) + ' を占う',
    data: `action=divine&roomId=${roomId}&target=${uid}`,
    displayText: '占いました',
  }));

  // 怪盗と交換されていても、元の占い師に占いメッセージを送る
  const messageText = currentRole === '占い師' 
    ? 'あなたは 【占い師】 です。\n\n今宵、占いたい相手を1人選んでください。\n\n（15秒以内に選択してください）'
    : `あなたは現在 【${currentRole}】 ですが、元々占い師だったため占いを行えます。\n\n今宵、占いたい相手を1人選んでください。\n\n（15秒以内に選択してください）`;

  await lineClient.pushMessage({
    to: originalFortuneTellerId,
    messages: [
      {
        type: 'text',
        text: messageText,
        quickReply: {
          items: actions.map((action) => ({
            type: 'action' as const,
            action,
          })),
        },
      },
    ],
  });
}

/**
 * 朝（議論）フェーズを開始
 * 3分間の議論時間を開始
 * @param roomId ルームID
 * @param targetId メッセージ送信先ID
 */
export async function startDayPhase(roomId: string, targetId: string): Promise<void> {
  try {
    console.log('Starting day phase for room:', roomId, 'targetId:', targetId);

    // roomの状態を更新とタイマー設定
    const result = getRoomByRoomId(roomId);
    if (!result) {
      console.error('Room not found for day phase:', roomId);
      console.log('Active rooms:', Array.from(activeRooms.entries()).map(([k, v]) => ({ key: k, roomId: v.roomId, status: v.status })));
      return;
    }

    const { room } = result;

    // 既にdayフェーズなら何もしない（重複実行防止）
    if (room.status === 'day') {
      console.log('Day phase already started, skipping...');
      return;
    }

    // 既存のタイマーをすべてクリア（念のため）
    if (room.discussionTimers) {
      room.discussionTimers.forEach((timer: NodeJS.Timeout) => clearTimeout(timer));
    }
    
    room.status = 'day';
    room.discussionEndTime = Date.now() + 180000; // 3分後
    room.discussionTimers = []; // タイマー配列を初期化
    
    console.log('Room found and status updated to day:', roomId);

    // 朝の通知メッセージを送信
    await lineClient.pushMessage({
      to: targetId,
      messages: [
        {
          type: 'text',
          text: '...東の空が白み始めました。朝が訪れます。\n\n昨晩、犠牲者はいませんでした。\n\n（※ワンナイトモードでは、人狼の襲撃は発生しません）\n\nこれより、最後の議論を開始します。\n\n議論時間は [ 3分 ] です。\n\n占い師の情報を元に、皆さんの中に潜む「人狼」を必ず見つけ出してください。\n\n※GMは「延長」で1分延長、「議論終了」で即座に投票へ移行できます。\n\n💡「残り時間」「時間」「残り」のいずれかを送ると、残り時間を確認できます。',
        },
      ],
    });

    // カウントダウン通知（1分前）
    const timer1 = setTimeout(() => {
      lineClient.pushMessage({
        to: targetId,
        messages: [
          {
            type: 'text',
            text: '【残り1分】\n\n議論時間は残り1分です。',
          },
        ],
      });
    }, 120000); // 2分後

    // カウントダウン通知（30秒前）
    const timer2 = setTimeout(() => {
      lineClient.pushMessage({
        to: targetId,
        messages: [
          {
            type: 'text',
            text: '【残り30秒】\n\n議論時間は残り30秒です。',
          },
        ],
      });
    }, 150000); // 2分30秒後

    // カウントダウン通知（10秒前）
    const timer3 = setTimeout(() => {
      lineClient.pushMessage({
        to: targetId,
        messages: [
          {
            type: 'text',
            text: '【残り10秒】\n\nまもなく議論時間が終了します。',
          },
        ],
      });
    }, 170000); // 2分50秒後

    // 3分後に投票フェーズへ
    const timer4 = setTimeout(() => {
      startVotingPhase(roomId, targetId);
    }, 180000); // 180秒 = 3分

    // すべてのタイマーを保存
    room.discussionTimers = [timer1, timer2, timer3, timer4];
  } catch (error) {
    console.error('Error in startDayPhase:', error);
  }
}

/**
 * 投票フェーズを開始
 * 各プレイヤーに投票ボタンを送信
 * @param roomId ルームID
 * @param targetId メッセージ送信先ID
 */
export async function startVotingPhase(roomId: string, targetId: string): Promise<void> {
  console.log('Starting voting phase for room:', roomId);

  // roomの状態を更新
  const result = getRoomByRoomId(roomId);
  if (result) {
    result.room.status = 'voting';
  }

  const roles = roleAssignments.get(roomId);
  if (!roles) {
    console.error('No roles found for voting phase:', roomId);
    return;
  }

  // 投票開始メッセージ
  await lineClient.pushMessage({
    to: targetId,
    messages: [
      {
        type: 'text',
        text: '...議論の時間は終了しました。\n\nこれより、追放する人物を決定する「最終投票」に移ります。\n\nこの投票で、すべてが決まります。\n\n皆さんに、投票用のメッセージを個別に送信しました。\n\n追放したい人物に、投票してください。',
      },
    ],
  });

  // 各プレイヤーに投票ボタンを送信
  const playerIds = Array.from(roles.keys());

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

  for (const uid of playerIds) {
    // ダミープレイヤーは自動投票
    if (isDummyPlayer(uid)) {
      const otherPlayers = playerIds.filter((id) => id !== uid && !isDummyPlayer(id));
      const targetUid = otherPlayers.length > 0 
        ? otherPlayers[Math.floor(Math.random() * otherPlayers.length)]
        : 'PEACE_VILLAGE';
      
      console.log('Dummy auto-vote:', uid, '->', targetUid);
      
      // ダミーの投票を記録（動的インポートで循環依存を回避）
      setTimeout(async () => {
        const { handleVote } = await import('./actionHandlers');
        handleVote({ source: { userId: uid } }, roomId, uid, targetUid);
      }, Math.random() * 3000 + 1000); // 1-4秒後にランダム投票
      
      continue;
    }

    // 実プレイヤーには投票ボタンを送信
    const otherPlayers = playerIds.filter((id) => id !== uid);
    const actions = otherPlayers.map((targetUid) => ({
      type: 'postback' as const,
      label: (playerMap.get(targetUid) || targetUid.substring(0, 10)) + ' に投票',
      data: `action=vote&roomId=${roomId}&target=${targetUid}`,
      displayText: '投票しました',
    }));

    // 平和村の選択肢を追加
    actions.push({
      type: 'postback' as const,
      label: '平和村（誰も追放しない）',
      data: `action=vote&roomId=${roomId}&target=PEACE_VILLAGE`,
      displayText: '平和村に投票しました',
    });

    await lineClient.pushMessage({
      to: uid,
      messages: [
        {
          type: 'text',
          text: 'あなたが「人狼」だと思う人物を選んでください。\n\nもし「人狼が場札にいる（平和村）」と判断した場合は、「平和村」に投票してください。',
          quickReply: {
            items: actions.map((action) => ({
              type: 'action' as const,
              action,
            })),
          },
        },
      ],
    });
  }
}
