/**
 * LINE Bot クライアント
 */

import { messagingApi } from '@line/bot-sdk';

const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const channelAccessToken = process.env.LINE_CHANNEL_TOKEN || '';

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken,
});

/**
 * ダミープレイヤーかどうかを判定
 * @param userId ユーザーID
 * @returns ダミープレイヤーの場合true
 */
export function isDummyPlayer(userId: string): boolean {
  return userId.startsWith('dummy_');
}

/**
 * ダミープレイヤー名を生成
 * @param index インデックス
 * @returns ダミープレイヤー名
 */
export function generateDummyName(index: number): string {
  const names = ['太郎', 'ハナコ', 'ケンジ', 'ユキ', 'タロウ', 'サクラ', 'ダイチ', 'アイ'];
  const baseName = names[index % names.length];
  const suffix = index >= names.length ? Math.floor(index / names.length) : '';
  return baseName + suffix;
}
