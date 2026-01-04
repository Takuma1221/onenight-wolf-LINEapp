/**
 * ゲーム状態管理
 * メモリベースのゲームルーム情報を管理
 * 
 * 注意: 本番環境ではRedisなど永続化ストレージの使用を推奨
 */

import { RoomData } from './types';
import { Role } from '@/lib/roleDistribution';

/**
 * アクティブなゲームルーム
 * キー: LINEグループID or ユーザーID
 * 値: ルームデータ
 */
export const activeRooms = new Map<string, RoomData>();

/**
 * 役職割り当て情報
 * キー: ルームID
 * 値: Map<ユーザーID, 役職>
 */
export const roleAssignments = new Map<string, Map<string, Role>>();

/**
 * グローバルデフォルト設定
 * ゲーム開始前に設定された値を保存し、新しいゲームに適用
 */
export const globalSettings = {
  nightPhaseDuration: 45000, // デフォルト45秒
  thiefPhaseDuration: 22500, // デフォルト22.5秒
};

/**
 * グローバル設定を更新
 * @param nightDuration 夜フェーズの時間（ミリ秒）
 */
export function updateGlobalSettings(nightDuration: number): void {
  globalSettings.nightPhaseDuration = nightDuration;
  globalSettings.thiefPhaseDuration = Math.floor(nightDuration / 2);
  console.log('Global settings updated:', globalSettings);
}

/**
 * ルームIDからルームデータとキーを取得
 * @param roomId ルームID
 * @returns ルームデータとキー、見つからない場合はnull
 */
export function getRoomByRoomId(roomId: string): { room: RoomData; key: string } | null {
  for (const [key, value] of activeRooms.entries()) {
    if (value.roomId === roomId) {
      return { room: value, key };
    }
  }
  return null;
}

/**
 * lookupId（グループIDまたはユーザーID）からルームを取得
 * groupIdフィールドもチェックして、より柔軟に検索
 * @param lookupId LINEグループID or ユーザーID
 * @returns ルームデータとキー、見つからない場合はnull
 */
export function getRoomByLookupId(lookupId: string): { room: RoomData; key: string } | null {
  // まず直接キーで検索
  const directMatch = activeRooms.get(lookupId);
  if (directMatch) {
    return { room: directMatch, key: lookupId };
  }
  
  // キーが見つからない場合、全ルームを走査
  for (const [key, value] of activeRooms.entries()) {
    // groupIdが一致するか、roomIdが一致するか、gmUserIdが一致する場合
    if (value.groupId === lookupId || value.roomId === lookupId || value.gmUserId === lookupId) {
      return { room: value, key };
    }
  }
  
  return null;
}

/**
 * ルームを削除（ゲーム終了時）
 * @param roomId ルームID
 */
export function removeRoom(roomId: string): void {
  for (const [key, value] of activeRooms.entries()) {
    if (value.roomId === roomId) {
      activeRooms.delete(key);
      roleAssignments.delete(roomId);
      console.log('Room removed:', roomId);
      break;
    }
  }
}
