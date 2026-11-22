import type { BankSnapshot } from '../data/records'

/**
 * 题库历史版本的保留策略。
 *
 * 为什么需要单独一个常量文件：内存、IndexedDB、SQLite 三个实现都要执行同一个上限，
 * 分散在各处必然漂移。一份快照含完整题目（可能上千题），不设上限会让存储
 * 随每次编辑线性膨胀。
 *
 * 20 份 ≈ 覆盖一个学期的高频修改；再早的版本价值低、体积代价高。
 */
export const BANK_SNAPSHOT_LIMIT = 20

/**
 * 写入一份题库快照后的新列表：同 id 覆盖，同题库按 savedAt 倒序裁剪，
 * 其他题库原样保留。store、内存仓储与 IndexedDB 都走这一份，
 * 避免「界面里 20 条、落库后 21 条」这种两端各算一次的问题。
 */
export function nextBankSnapshots(
  current: readonly BankSnapshot[],
  entry: BankSnapshot,
): BankSnapshot[] {
  const sameBank = current.filter(
    (item) => item.bankId === entry.bankId && item.id !== entry.id,
  )
  const others = current.filter((item) => item.bankId !== entry.bankId)
  const kept = [...sameBank, entry]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, BANK_SNAPSHOT_LIMIT)
  return [...others, ...kept]
}
