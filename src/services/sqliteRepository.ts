import { invoke } from '@tauri-apps/api/core'
import type {
  AppSettings,
  BankSnapshot,
  DataSnapshot,
  HistoryEntry,
  ImportedBank,
  PaperRecord,
  PendingSession,
  WrongEntry,
} from '../data/records'
import {
  normalizeSnapshot,
  snapshotToRaw,
  type RawSnapshot,
  type Repository,
} from './repository'

/**
 * Tauri 桌面端仓储：直连 Rust 侧的 SQLite。
 *
 * 为什么走 `invoke` 而不是 HTTP：桌面壳里前后端同进程，IPC 免去端口、
 * 鉴权与进程生命周期管理，也不会被防火墙拦截。命令实现在
 * `src-tauri/src/db.rs`，表结构与这里的方法一一对应。
 */

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args)
}

export function createSqliteRepository(): Repository {
  return {
    driver: 'sqlite',
    location: '应用数据目录 / quizchest.db',

    async load(): Promise<DataSnapshot> {
      const raw = await call<RawSnapshot>('db_load')
      return normalizeSnapshot(raw)
    },

    async saveSettings(settings: AppSettings): Promise<void> {
      await call('db_save_settings', { settings })
    },

    async setLastCollection(collectionId: string | null): Promise<void> {
      await call('db_set_last_collection', { collectionId })
    },

    async setPendingSession(session: PendingSession | null): Promise<void> {
      // 未完成会话整条存进 meta 表（JSON）。不做拆表：它只有一份、
      // 只在开始/推进/结束时整体覆盖，拆成关系表只会增加迁移负担。
      await call('db_set_pending_session', { session })
    },

    async addBankSnapshot(entry: BankSnapshot): Promise<void> {
      await call('db_add_bank_snapshot', { snapshot: entry })
    },

    async removeBankSnapshot(snapshotId: string): Promise<void> {
      await call('db_remove_bank_snapshot', { snapshotId })
    },

    async clearBankSnapshots(bankId: string): Promise<void> {
      await call('db_clear_bank_snapshots', { bankId })
    },

    async setFavorite(questionId: string, favorite: boolean): Promise<void> {
      await call('db_set_favorite', { questionId, favorite })
    },

    async clearFavorites(): Promise<void> {
      await call('db_clear_favorites')
    },

    async recordWrong(entry: WrongEntry): Promise<void> {
      await call('db_record_wrong', { entry })
    },

    async removeWrong(questionId: string): Promise<void> {
      await call('db_remove_wrong', { questionId })
    },

    async clearWrongBook(): Promise<void> {
      await call('db_clear_wrong_book')
    },

    async addHistory(entry: HistoryEntry): Promise<void> {
      await call('db_add_history', { entry })
    },

    async clearHistory(): Promise<void> {
      await call('db_clear_history')
    },

    async upsertBank(bank: ImportedBank): Promise<void> {
      await call('db_upsert_bank', { bank })
    },

    async deleteBank(bankId: string): Promise<void> {
      await call('db_delete_bank', { bankId })
    },

    async addPaper(paper: PaperRecord): Promise<void> {
      await call('db_add_paper', { paper })
    },

    async removePaper(paperId: string): Promise<void> {
      await call('db_remove_paper', { paperId })
    },

    async resetProgress(): Promise<void> {
      await call('db_reset_progress')
    },

    async replaceAll(snapshot: DataSnapshot): Promise<void> {
      await call('db_replace_all', { snapshot: snapshotToRaw(snapshot) })
    },

    async close(): Promise<void> {
      // 连接随进程退出释放，无需显式关闭。
    },
  }
}

export async function sqliteLocation(): Promise<string> {
  try {
    return await call<string>('db_path')
  } catch {
    return '应用数据目录 / quizchest.db'
  }
}

/**
 * 隔离当前不可用的数据库并新建空库。
 *
 * 只在启动错误页使用：数据库损坏时连接根本打不开，备份恢复也就无处落盘，
 * 必须先重建出一个可用库，才有地方写入恢复的数据。原文件被改名保留。
 * 返回被隔离文件的路径，供界面告知用户。
 */
export async function rebuildDatabase(): Promise<string> {
  return call<string>('db_rebuild', { confirm: true })
}
