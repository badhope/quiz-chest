import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { useDataLayer } from '../hooks/useDataLayer'
import { collections } from '../data/taxonomy'
import { getQuestion, isBareContentBuild, totalQuestions } from '../data'
import { collectionTitleOf } from '../lib/search'
import { dateStamp, downloadCsv, historyToCsv, wrongBookToCsv } from '../lib/csvExport'
import { APP_VERSION, versionLabel } from '../lib/version'
import {
  backupFileName,
  buildBackup,
  downloadBackup,
  parseBackup,
} from '../lib/backup'
import { ArrowRight, Download, Menu, Settings, Sun, Moon, RotateCcw, Upload } from '../components/ui/icons'

/**
 * 备份恢复的单文件体积上限。
 *
 * 备份是纯文本 JSON，`readAsText` 会整体读入内存再 `JSON.parse`，
 * 没有上限时一个误选的巨型文件会让页面直接卡死。
 * 50MB 对应的题库量（约数十万题）远超单机应用的实际使用范围。
 */
const MAX_BACKUP_BYTES = 50 * 1024 * 1024

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings)
  const setTheme = useAppStore((state) => state.setTheme)
  const setFontScale = useAppStore((state) => state.setFontScale)
  const setAutoNext = useAppStore((state) => state.setAutoNext)
  const setShowSampleBanks = useAppStore((state) => state.setShowSampleBanks)
  const bankCount = useAppStore((state) => state.banks.length)
  const resetProgress = useAppStore((state) => state.resetProgress)
  const favorites = useAppStore((state) => state.favorites)
  const wrongBook = useAppStore((state) => state.wrongBook)
  const history = useAppStore((state) => state.history)
  const daily = useAppStore((state) => state.daily)
  const banks = useAppStore((state) => state.banks)
  const papers = useAppStore((state) => state.papers)
  const restoreBackup = useAppStore((state) => state.restoreBackup)
  const persistenceError = useAppStore((state) => state.persistenceError)
  const health = useDataLayer()

  const backupInputRef = useRef<HTMLInputElement>(null)
  const [backupMessage, setBackupMessage] = useState('')
  const [restoring, setRestoring] = useState(false)

  const onExportBackup = () => {
    const payload = buildBackup({
      appVersion: APP_VERSION,
      settings,
      favorites,
      wrongBook,
      history,
      daily,
      banks,
      papers,
    })
    downloadBackup(payload)
    setBackupMessage(`已导出 ${backupFileName()}，请妥善保存。`)
  }

  const onRestoreBackup = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) {
      setBackupMessage(
        `备份文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），单次恢复上限 ${MAX_BACKUP_BYTES / 1024 / 1024} MB。`,
      )
      return
    }
    setRestoring(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const raw = String(reader.result ?? '')
      const result = parseBackup(raw)
      if (!result.payload) {
        setBackupMessage(`恢复失败：${result.error}`)
        setRestoring(false)
        return
      }
      const { data } = result.payload
      const summary = `${data.banks.length} 个题库、${data.history.length} 条记录、${Object.keys(data.wrongBook).length} 道错题`
      if (
        !window.confirm(
          `将用备份覆盖本机数据（${summary}）。当前数据会被替换且无法撤销，确定继续？`,
        )
      ) {
        setRestoring(false)
        return
      }
      try {
        // await：落库失败时必须报失败，不能显示「恢复成功」。
        await restoreBackup(data)
        setBackupMessage(`恢复成功：${summary}。`)
      } catch (error) {
        setBackupMessage(
          `恢复失败：${error instanceof Error ? error.message : String(error)}。原数据未被替换，可重试。`,
        )
      } finally {
        setRestoring(false)
      }
    }
    reader.onerror = () => {
      setBackupMessage('读取备份文件失败，请重试。')
      setRestoring(false)
    }
    reader.readAsText(file, 'utf-8')
  }

  return (
    <div className="settings-page">
      <header className="page-head">
        <span className="eyebrow">设置</span>
        <h1 className="page-title serif">按你的习惯调整</h1>
        <p className="page-sub">所有设置保存在本机数据库，不涉及账号与云端同步。</p>
      </header>

      <section className="settings-group">
        <div className="settings-group-head">
          <h2 className="serif">外观</h2>
          <span>主题与阅读大小</span>
        </div>
        <div className="settings-row">
          <div>
            <strong>主题</strong>
            <p>浅色为纸张质感，深色适合夜间刷题。</p>
          </div>
          <div className="segmented">
            <button
              className={settings.theme === 'light' ? 'active' : ''}
              onClick={() => setTheme('light')}
            >
              <Sun /> 浅色
            </button>
            <button
              className={settings.theme === 'dark' ? 'active' : ''}
              onClick={() => setTheme('dark')}
            >
              <Moon /> 深色
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>字号</strong>
            <p>放大题干与解析文字，减少长时间阅读疲劳。</p>
          </div>
          <div className="segmented">
            <button
              className={settings.fontScale === 'normal' ? 'active' : ''}
              onClick={() => setFontScale('normal')}
            >
              标准
            </button>
            <button
              className={settings.fontScale === 'large' ? 'active' : ''}
              onClick={() => setFontScale('large')}
            >
              大号
            </button>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-head">
          <h2 className="serif">答题</h2>
          <span>练习时的行为</span>
        </div>
        <div className="settings-row">
          <div>
            <strong>自动跳转下一题</strong>
            <p>练习模式下答对后自动进入下一题，适合快速过题。</p>
          </div>
          <button
            role="switch"
            aria-checked={settings.autoNext}
            className={`switch${settings.autoNext ? ' on' : ''}`}
            onClick={() => setAutoNext(!settings.autoNext)}
          >
            <span />
          </button>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-head">
          <h2 className="serif">题库</h2>
          <span>内容来源</span>
        </div>
        {isBareContentBuild ? (
          <div className="settings-row">
            <div>
              <strong>示例题库</strong>
              <p>当前是无内置内容构建，只包含你自己导入的题库。</p>
            </div>
          </div>
        ) : (
          <div className="settings-row">
            <div>
              <strong>显示示例题库</strong>
              <p>
                内置的 32 个示例题库每个只有 6-7 题，仅演示产品结构。关闭后题库总览只显示你导入的题库。
              </p>
            </div>
            <button
              role="switch"
              aria-checked={settings.showSampleBanks}
              className={`switch${settings.showSampleBanks ? ' on' : ''}`}
              onClick={() => setShowSampleBanks(!settings.showSampleBanks)}
            >
              <span />
            </button>
          </div>
        )}
        <div className="settings-row">
          <div>
            <strong>导入题库</strong>
            <p>
              当前已导入 {bankCount} 个题库。支持 JSON / CSV，逐行校验后保存在本机。
            </p>
          </div>
          <Link to="/import" className="button button-ghost button-sm">
            <Upload /> 去导入
          </Link>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-head">
          <h2 className="serif">数据</h2>
          <span>保存在本机</span>
        </div>
        <div className="settings-data">
          <div>
            <strong className="mono">{bankCount}</strong>
            <span>导入题库</span>
          </div>
          <div>
            <strong className="mono">{collections.length}</strong>
            <span>示例题库</span>
          </div>
          <div>
            <strong className="mono">{totalQuestions}</strong>
            <span>示例题目</span>
          </div>
          <div>
            <strong className="mono">{favorites.length}</strong>
            <span>收藏</span>
          </div>
          <div>
            <strong className="mono">{Object.keys(wrongBook).length}</strong>
            <span>错题</span>
          </div>
          <div>
            <strong className="mono">{history.length}</strong>
            <span>练习记录</span>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>导出练习数据</strong>
            <p>成绩记录与错题清单导出为 CSV，可用 Excel 打开，跨设备留档。</p>
          </div>
          <div className="settings-row-actions">
            <button
              className="button button-ghost button-sm"
              disabled={history.length === 0}
              onClick={() => downloadCsv(`成绩记录-${dateStamp()}.csv`, historyToCsv(history))}
            >
              <Download /> 成绩
            </button>
            <button
              className="button button-ghost button-sm"
              disabled={Object.keys(wrongBook).length === 0}
              onClick={() =>
                downloadCsv(
                  `错题清单-${dateStamp()}.csv`,
                  wrongBookToCsv(
                    wrongBook,
                    (id) => {
                      const question = getQuestion(id)
                      return question
                        ? { stem: question.stem, collectionId: question.collectionId, wrongCount: wrongBook[id]?.wrongCount ?? 0, lastWrongAt: wrongBook[id]?.lastWrongAt ?? 0 }
                        : undefined
                    },
                    (collectionId) => collectionTitleOf(collectionId) || '我的题库',
                  ),
                )
              }
            >
              <Download /> 错题
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>本地数据库</strong>
            <p>
              {health.degraded
                ? health.message
                : `数据存放在${health.location}，关闭应用后仍保留，全程不经过网络。`}
            </p>
            {persistenceError ? (
              <p className="settings-inline-note" role="alert">
                最近一次保存失败：{persistenceError}
              </p>
            ) : null}
          </div>
          <div className="settings-row-actions">
            <span className="mono settings-driver">{health.driver}</span>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>完整备份与恢复</strong>
            <p>
              导出一个 JSON 备份，包含全部题库、错题、收藏、记录、组卷历史与设置。
              换设备、清理浏览器数据或卸载应用前先导出，可在任意设备恢复。
            </p>
            {backupMessage ? (
              <p className="settings-inline-note" role="status">
                {backupMessage}
              </p>
            ) : null}
          </div>
          <div className="settings-row-actions">
            <button className="button button-ghost button-sm" onClick={onExportBackup}>
              <Download /> 导出备份
            </button>
            <button
              className="button button-ghost button-sm"
              disabled={restoring}
              onClick={() => backupInputRef.current?.click()}
            >
              <Upload /> {restoring ? '正在恢复…' : '恢复备份'}
            </button>
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              onChange={(event) => {
                onRestoreBackup(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>重置学习数据</strong>
            <p>清空收藏、错题、练习记录与每日统计，设置保持不变。</p>
          </div>
          <button
            className="button button-ghost button-sm"
            onClick={() => {
              if (window.confirm('确定重置全部学习数据？该操作不可撤销。')) resetProgress()
            }}
          >
            <RotateCcw /> 重置
          </button>
        </div>
      </section>

      <section className="settings-group about-group">
        <div className="settings-group-head">
          <h2 className="serif">关于题匣</h2>
          <span>版本 {versionLabel(APP_VERSION)}</span>
        </div>
        <p className="about-copy">
          题匣是一个本地优先的题库应用：导入自有题库后，可在浏览器、桌面（Tauri）或安卓（Capacitor）
          中离线练习、模拟考试和复习错题。学习数据保存在本机，不上传、不需要注册。
        </p>
        <div className="about-links">
          <Link to="/catalog" className="text-link">
            浏览题库 <ArrowRight />
          </Link>
          <span className="about-tech">
            <Menu /> React 19 · Vite · TypeScript
          </span>
        </div>
      </section>

      <div className="settings-note">
        <Settings /> 跨端打包步骤见项目 docs/CROSS_PLATFORM.md
      </div>
    </div>
  )
}
