/**
 * ゲームの型定義（ワンナイト人狼専用）
 */

import { Role } from '@/lib/roleDistribution';

/**
 * ルームの状態
 * - recruiting: 参加者募集中
 * - night: 夜フェーズ（占い師の行動）
 * - day: 昼フェーズ（議論）
 * - voting: 投票フェーズ
 * - finished: ゲーム終了
 */
export type RoomStatus = 'recruiting' | 'night' | 'day' | 'voting' | 'finished';

/**
 * ルームデータ（ワンナイト人狼）
 * activeRoomsマップに保存される各ゲームルームの情報
 */
export interface RoomData {
  roomId: string;                    // ルーム識別子（例: room_1234567890）
  groupId?: string;                  // LINEグループID（グループチャットの場合）
  gmUserId: string;                  // ゲームマスター（開始者）のLINEユーザーID
  participants: Set<string>;         // 参加者のLINEユーザーID一覧
  status: RoomStatus;                // 現在のゲーム状態
  fortuneTellerResult?: {            // 占い結果（占い師が占った場合）
    userId: string;                  // 占い師のID
    target: string;                  // 占い対象のID
    isWerewolf: boolean;             // 人狼かどうか
  };
  votes?: Map<string, string>;       // 投票記録（投票者ID -> 投票先ID）
  fieldCards?: Role[];               // 場札（配られなかったカード）
  nightTimer?: NodeJS.Timeout;       // 夜フェーズのタイマー
  discussionTimers?: NodeJS.Timeout[]; // 議論フェーズのタイマー配列
  discussionEndTime?: number;        // 議論終了予定時刻（Unix時間）
  originalThiefId?: string;          // 元の怪盗のID（交換前）
  originalFortuneTellerId?: string;  // 元の占い師のID（交換前）
  nightPhaseDuration?: number;       // 夜フェーズの総時間（ミリ秒、デフォルト45000=45秒）
  thiefPhaseDuration?: number;       // 怪盗フェーズの時間（ミリ秒、デフォルト22500=22.5秒）
}
