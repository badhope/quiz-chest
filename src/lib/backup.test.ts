import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  buildBackup,
  parseBackup,
  serializeBackup,
  type BackupPayload,
} from './backup'
import type { AppSettings } from '../store/useAppStore'

const settings: AppSettings = {
  theme: 'dark',
  fontScale: 'large',
  autoNext: true,
  showSampleBanks: false,
}

function samplePayload(): BackupPayload {
  return buildBackup({
    appVersion: '1.1.0',
    settings,
    favorites: ['q1', 'q2'],
    wrongBook: {
      q1: { questionId: 'q1', collectionId: 'bank-1', wrongCount: 2, lastWrongAt: 1000, lastSelection: [0] },
    },
    history: [
      {
        id: 'h1',
        mode: 'practice',
        collectionId: 'bank-1',
        collectionTitle: '示例题库',
        answered: 5,
        correct: 4,
        wrong: 1,
        skipped: 0,
        total: 5,
        accuracy: 80,
        durationSec: 120,
        finishedAt: 1000,
        dateKey: '2026-11-02',
      },
    ],
    daily: { '2026-11-02': { date: '2026-11-02', answered: 5, correct: 4 } },
    banks: [
      {
        id: 'bank-1',
        title: '示例题库',
        subtitle: '',
        description: '',
        exam: '',
        icon: 'book',
        accent: '#315B7D',
        level: '入门',
        durationMin: 10,
        tags: [],
        importedAt: 1000,
        questions: [],
      },
    ],
    papers: [],
  })
}

describe('backup', () => {
  it('round-trips a full payload through serialize and parse', () => {
    const original = samplePayload()
    const restored = parseBackup(serializeBackup(original))
    expect(restored.error).toBe('')
    expect(restored.payload?.data.favorites).toEqual(['q1', 'q2'])
    expect(restored.payload?.data.settings).toEqual(settings)
    expect(restored.payload?.data.banks).toHaveLength(1)
    expect(restored.payload?.data.history[0].accuracy).toBe(80)
  })

  it('stamps the current format and version', () => {
    const payload = samplePayload()
    expect(payload.format).toBe(BACKUP_FORMAT)
    expect(payload.version).toBe(BACKUP_VERSION)
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('rejects non-JSON input', () => {
    expect(parseBackup('not json').error).toBe('文件不是合法的 JSON')
  })

  it('rejects JSON from another application', () => {
    const error = parseBackup('{"format":"something-else","version":1,"data":{}}').error
    expect(error).toBe('不是 QuizChest 备份文件')
  })

  it('rejects a backup from a newer app version', () => {
    const payload = serializeBackup({ ...samplePayload(), version: BACKUP_VERSION + 1 })
    expect(parseBackup(payload).error).toContain('请升级应用')
  })

  it('rejects structurally damaged collections instead of partially importing', () => {
    const bad = JSON.parse(serializeBackup(samplePayload()))
    bad.data.favorites = 'not-an-array'
    expect(parseBackup(JSON.stringify(bad)).error).toBe('备份中的收藏数据损坏')

    const badBanks = JSON.parse(serializeBackup(samplePayload()))
    badBanks.data.banks = null
    expect(parseBackup(JSON.stringify(badBanks)).error).toBe('备份中的题库数据损坏')
  })

  it('produces a timestamped filename that sorts chronologically', () => {
    const name = backupFileName(new Date(2026, 10, 2, 9, 5))
    expect(name).toBe('quizchest-backup-20261102-0905.json')
  })
})
