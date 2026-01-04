/**
 * ワンナイト人狼 - 役職配布ロジック
 */

export type Role = '人狼' | '占い師' | '市民';

export interface RoleDistribution {
  [role: string]: number;
}

// ワンナイト人狼の配役（プレイヤー数+2枚の構成）
export const ROLE_DISTRIBUTIONS: { [playerCount: number]: RoleDistribution } = {
  3: { '人狼': 1, '占い師': 1, '市民': 3 },  // 5枚: 3人 + 場札2枚
  4: { '人狼': 1, '占い師': 1, '市民': 4 },  // 6枚: 4人 + 場札2枚
  5: { '人狼': 2, '占い師': 1, '市民': 4 },  // 7枚: 5人 + 場札2枚
  6: { '人狼': 2, '占い師': 1, '市民': 5 },  // 8枚: 6人 + 場札2枚
  7: { '人狼': 2, '占い師': 1, '市民': 6 },  // 9枚: 7人 + 場札2枚
  8: { '人狼': 2, '占い師': 1, '市民': 7 },  // 10枚: 8人 + 場札2枚
};

/**
 * プレイヤー数から役職配分を取得
 * @param playerCount 参加人数
 * @returns 役職の配分
 */
export function getRoleDistribution(playerCount: number): RoleDistribution | null {
  return ROLE_DISTRIBUTIONS[playerCount] || null;
}

/**
 * 役職をランダムに参加者に割り当てる（ワンナイト人狼用：場札を含む）
 * @param userIds 参加者のUserID配列
 * @param distribution 役職の配分
 * @returns { assignments: {userId: role}のマッピング, fieldCards: 場札の配列 }
 */
export function assignRolesToPlayers(
  userIds: string[],
  distribution: RoleDistribution
): { assignments: Map<string, Role>; fieldCards: Role[] } {
  // 役職リストを作成（全カード）
  const roles: Role[] = [];
  for (const [role, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i++) {
      roles.push(role as Role);
    }
  }

  // シャッフル
  const shuffled = shuffle(roles);

  // 参加者に割り当て
  const assignments = new Map<string, Role>();
  userIds.forEach((userId, index) => {
    assignments.set(userId, shuffled[index]);
  });

  // 残りを場札に
  const fieldCards = shuffled.slice(userIds.length);

  return { assignments, fieldCards };
}

/**
 * 配列をシャッフルする（Fisher-Yates）
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 役職の説明を取得（ワンナイト人狼用）
 */
export function getRoleDescription(role: Role): {
  team: string;
  winCondition: string;
  ability: string;
} {
  if (role === '人狼') {
    return {
      team: '人狼チーム',
      winCondition: '昼の投票で、自分以外の人物が追放されること。',
      ability: '人狼の正体を隠し、市民を騙して生き残りましょう。',
    };
  } else if (role === '占い師') {
    return {
      team: '市民チーム',
      winCondition: '昼の投票で、人狼を追放すること。',
      ability: '今晩、1人を選び、その人が「人狼」か「人狼ではない」かを知ることができます。',
    };
  } else {
    // 市民
    return {
      team: '市民チーム',
      winCondition: '昼の投票で、人狼を追放すること。',
      ability: '特別な能力はありません。占い師の情報を元に、人狼を見つけ出してください。',
    };
  }
}
