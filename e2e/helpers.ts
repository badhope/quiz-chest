import type { DataSnapshot, DailyStat, HistoryEntry, ImportedBank, PaperRecord, WrongEntry } from '../src/data/records'

/**
 * E2E 共用工具：直接读 IndexedDB，证明数据真的落库，而不只是内存里变了。
 *
 * 与单元测试的差别：这里跑在真实浏览器里，走的是应用真实的写入路径
 * （store → repository → IndexedDB），能抓住「内存对了但落库丢了」的缺陷。
 */
export async function readStores(page: {
  evaluate: <T>(fn: () => Promise<T>) => Promise<T>
}): Promise<{
  banks: ImportedBank[]
  history: HistoryEntry[]
  wrong: WrongEntry[]
  favorites: { questionId: string }[]
  daily: Record<string, DailyStat>
  papers: PaperRecord[]
  pendingSession: import('../src/data/records').PendingSession | null
  bankSnapshots: import('../src/data/records').BankSnapshot[]
  settings: DataSnapshot['settings']
}> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('quizchest', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const getAll = <T,>(store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result as T[])
        request.onerror = () => reject(request.error)
      })
    const settings = (await getAll<{ key: string; value: DataSnapshot['settings'] }>('meta')).find(
      (record) => record.key === 'settings',
    )?.value
    const dailyList = await getAll<{ date: string; answered: number; correct: number }>('daily')
    const pendingRecord = (await getAll<{ key: string; value: unknown }>('meta')).find(
      (record) => record.key === 'pendingSession',
    )
    return {
      banks: await getAll<ImportedBank>('banks'),
      history: await getAll<HistoryEntry>('history'),
      wrong: await getAll<WrongEntry>('wrongBook'),
      favorites: await getAll<{ questionId: string }>('favorites'),
      papers: await getAll<PaperRecord>('papers'),
      pendingSession: (pendingRecord?.value ?? null) as import('../src/data/records').PendingSession | null,
      bankSnapshots: await getAll<import('../src/data/records').BankSnapshot>('bankSnapshots'),
      daily: Object.fromEntries(dailyList.map((entry) => [entry.date, entry])),
      settings: settings ?? {
        theme: 'light',
        fontScale: 'normal',
        autoNext: false,
        showSampleBanks: true,
      },
    }
  })
}
