/**
 * LINE Bot クライアント
 */

import { messagingApi } from '@line/bot-sdk';

const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
const channelAccessToken = process.env.LINE_CHANNEL_TOKEN || '';

const baseClient = new messagingApi.MessagingApiClient({
  channelAccessToken,
});

/**
 * LINE APIのエラーをチェックし、適切なログを出力
 */
function handleLineApiError(error: any, operation: string): void {
  console.error(`LINE API Error in ${operation}:`, error);
  
  if (error.response) {
    const { status, data } = error.response;
    console.error(`Status: ${status}`);
    console.error(`Response:`, JSON.stringify(data, null, 2));
    
    // 月次上限エラーのチェック
    if (data?.message === 'You have reached your monthly limit.') {
      console.error('❌❌❌ LINE API 月次上限に達しました！ ❌❌❌');
      console.error('無料プランの場合、月500メッセージまでです。');
      console.error('プランをアップグレードするか、来月まで待つ必要があります。');
    }
  }
}

/**
 * ラップされたLINEクライアント
 */
export const lineClient = {
  /**
   * メッセージを送信（pushMessage）
   */
  async pushMessage(request: any): Promise<any> {
    try {
      return await baseClient.pushMessage(request);
    } catch (error) {
      handleLineApiError(error, 'pushMessage');
      throw error;
    }
  },

  /**
   * 返信メッセージを送信（replyMessage）
   */
  async replyMessage(request: any): Promise<any> {
    try {
      return await baseClient.replyMessage(request);
    } catch (error) {
      handleLineApiError(error, 'replyMessage');
      throw error;
    }
  },

  /**
   * ユーザープロフィールを取得
   */
  async getProfile(userId: string): Promise<any> {
    try {
      return await baseClient.getProfile(userId);
    } catch (error) {
      handleLineApiError(error, 'getProfile');
      throw error;
    }
  },
};


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
