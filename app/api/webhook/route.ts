/**
 * LINE Bot Webhook エンドポイント
 * 
 * ワンナイト人狼ゲームのメインエントリーポイント
 * LINEからのWebhookイベントを受信し、適切なハンドラーに振り分ける
 */

import { NextResponse } from 'next/server';
import { WebhookEvent } from '@line/bot-sdk';
import { lineClient } from '@/lib/game/lineClient';
import { activeRooms, roleAssignments } from '@/lib/game/gameState';
import { 
  handleGameStart, 
  handleTestGameStart, 
  handleAddDummies,
  handleGameEnd 
} from '@/lib/game/gameHandlers';
import { 
  handleRecruitmentEnd,
  handleDiscussionEnd,
  handleExtendDiscussion,
  handleShowRemainingTime,
  handleSettings,
  handleChangeNightTime
} from '@/lib/game/controlHandlers';
import { handleAutoAssign } from '@/lib/game/assignmentHandlers';
import { handleDivine, handleVote, handleThiefSwap } from '@/lib/game/actionHandlers';

/**
 * メインイベントハンドラー
 * LINEからのイベントを種類に応じて処理
 */
async function handleEvent(event: WebhookEvent): Promise<void> {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  // テキストメッセージの処理
  if (event.type === 'message' && event.message.type === 'text') {
    const userId = event.source.userId;
    const text = event.message.text;
    console.log('Text message from user:', userId, 'text:', text);

    // テスト開始コマンド（ダミープレイヤー付き）
    if (text === 'テスト開始' || text.startsWith('テスト開始 ')) {
      await handleTestGameStart(event, text);
      return;
    }

    // ダミー追加コマンド
    if (text.startsWith('ダミー追加')) {
      await handleAddDummies(event, text);
      return;
    }

    // ゲーム開始コマンド
    if (text === 'ゲーム開始') {
      await handleGameStart(event);
      return;
    }

    // 募集終了コマンド
    if (text === '募集終了') {
      await handleRecruitmentEnd(event);
      return;
    }

    // ゲーム終了コマンド
    if (text === 'ゲーム終了') {
      await handleGameEnd(event);
      return;
    }

    // 議論終了コマンド
    if (text === '議論終了') {
      await handleDiscussionEnd(event);
      return;
    }

    // 延長コマンド
    if (text === '延長' || text === '時間延長') {
      await handleExtendDiscussion(event);
      return;
    }

    // 残り時間コマンド
    if (text === '残り時間' || text === '時間' || text === '残り') {
      await handleShowRemainingTime(event);
      return;
    }

    // 設定コマンド
    if (text === '設定') {
      await handleSettings(event);
      return;
    }

    // その他のメッセージは無視
    return;
  }

  // ポストバックイベントの処理（参加ボタンなど）
  if (event.type === 'postback') {
    await handlePostback(event);
    return;
  }

  console.log('Skipping non-text message event');
}

/**
 * ポストバックイベントハンドラー
 * ボタンやクイックリプライからのアクションを処理
 */
async function handlePostback(event: any): Promise<void> {
  const userId = event.source.userId;
  const postbackData = event.postback.data;

  console.log('Postback received:', postbackData, 'from user:', userId);

  const data = new URLSearchParams(postbackData);
  const action = data.get('action');
  const roomId = data.get('roomId');
  const mode = data.get('mode');

  if (!action) {
    console.log('No action in postback data');
    return;
  }

  // 参加処理
  if (action === 'join' && roomId) {
    const groupId = event.source.groupId || event.source.roomId;
    const lookupId = groupId || userId;
    
    // roomIdでルームを検索
    let room: any = null;
    for (const [key, value] of activeRooms.entries()) {
      if (value.roomId === roomId) {
        room = value;
        break;
      }
    }

    console.log('Join action:', { userId, groupId, lookupId, roomId, roomFound: !!room });

    if (room && room.status === 'recruiting') {
      // 既に参加済みかチェック
      if (room.participants.has(userId)) {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: 'text',
              text: 'あなたは既に参加しています。',
            },
          ],
        });
        return;
      }

      // 参加者として追加
      room.participants.add(userId);
      console.log('User joined:', userId, 'Total participants:', room.participants.size);

      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: `ゲームに参加しました！\n\n現在の参加者は ${room.participants.size} 名です。`,
          },
        ],
      });
    } else {
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: 'ゲームが見つからないか、募集が終了しています。',
          },
        ],
      });
    }
    return;
  }

  // ランダム配分
  if (action === 'auto_assign' && roomId) {
    await handleAutoAssign(event, roomId);
    return;
  }

  // 怪盗の交換処理
  if (action === 'thief_swap' && roomId) {
    const target = data.get('target');
    if (target) {
      await handleThiefSwap(event, roomId, userId, target);
    }
    return;
  }

  // 夜フェーズ時間変更
  if (action === 'change_night_time' && roomId) {
    const durationStr = data.get('duration');
    if (durationStr) {
      const duration = parseInt(durationStr, 10);
      await handleChangeNightTime(event, roomId, duration);
    }
    return;
  }

  // 占い処理
  if (action === 'divine' && roomId) {
    const target = data.get('target');
    if (target) {
      await handleDivine(event, roomId, userId, target);
    }
    return;
  }

  // 投票処理
  if (action === 'vote' && roomId) {
    const target = data.get('target');
    if (target) {
      await handleVote(event, roomId, userId, target);
    }
    return;
  }
}

/**
 * Webhook POSTエンドポイント
 * LINEからのWebhookリクエストを受信
 */
export async function POST(request: Request): Promise<NextResponse> {
  console.log('=== Webhook POST received ===');
  
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature') || '';
    console.log('Request body:', body);

    // 署名検証
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    if (!channelSecret) {
      console.error('LINE_CHANNEL_SECRET is not set');
      return NextResponse.json({ status: 'error', message: 'Server configuration error' }, { status: 500 });
    }

    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha256', channelSecret)
      .update(body)
      .digest('base64');

    if (hash !== signature) {
      console.error('Invalid signature');
      return NextResponse.json({ status: 'error', message: 'Invalid signature' }, { status: 401 });
    }

    const data = JSON.parse(body);
    const events: WebhookEvent[] = data.events;
    console.log('Number of events:', events.length);

    // イベントを並列処理
    await Promise.all(
      events.map(async (event) => {
        await handleEvent(event);
      })
    );

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}
