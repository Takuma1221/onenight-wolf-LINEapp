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
 * @param lookupId LINEグループID or ユーザーID
 * @returns ルームデータとキー、見つからない場合はnull
 */
export function getRoomByLookupId(lookupId: string): { room: RoomData; key: string } | null {
  for (const [key, value] of activeRooms.entries()) {
    if (key === lookupId || value.roomId === lookupId) {
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
