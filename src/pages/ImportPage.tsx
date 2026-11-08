import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore, type ImportedBank } from '../store/useAppStore'
import {
  detectFormat,
  detectFormatFromContent,
  normalizeId,
  parseImportCsv,
  parseImportJson,
  type ImportIssue,
  type ParseResult,
} from '../lib/importer'
import { looksLikeExportPackage, parseExportPackage } from '../lib/exporter'
import { parseWorkbookFile } from '../services/xlsxImport'
import { Badge, EmptyState } from '../components/ui/primitives'
import { ArrowRight, BookOpen, CircleCheck, CircleX, Library, Upload } from '../components/ui/icons'

type Step = 'input' | 'review' | 'done'

/**
 * 单文件体积上限。
 *
 * 为什么必须有：`FileReader.readAsText` 会把整个文件读成字符串并同步解析，
 * 没有上限时用户选中一个大文件会直接卡死主线程。2000 题按每题 1KB 估算约 2MB，
 * 20MB 已留足余量，同时远低于会让浏览器无响应的量级。
 */
const MAX_IMPORT_BYTES = 20 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function issueKey(issue: ImportIssue, index: number): string {
  return `${issue.line}-${issue.field}-${index}`
}

export function ImportPage() {
  const addBank = useAppStore((state) => state.addBank)
  const existingBanks = useAppStore((state) => state.banks)
  const existingCount = existingBanks.length
  const [step, setStep] = useState<Step>('input')
  const [rawText, setRawText] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState('')
  const [overwriteBankId, setOverwriteBankId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const runParse = (text: string, name: string) => {
    setError('')
    setResult(null)
    setOverwriteBankId(null)
    if (looksLikeExportPackage(text)) {
      const pkg = parseExportPackage(text)
      if (pkg.bank) {
        const issues: ImportIssue[] = pkg.warnings.map((message) => ({
          line: 0,
          field: 'version',
          message,
        }))
        const parsed: ParseResult = {
          bank: {
            title: pkg.bank.title,
            subtitle: pkg.bank.subtitle,
            description: pkg.bank.description,
            exam: pkg.bank.exam,
            icon: pkg.bank.icon,
            accent: pkg.bank.accent,
            level: pkg.bank.level,
            durationMin: pkg.bank.durationMin,
            tags: pkg.bank.tags,
            questions: pkg.bank.questions,
          },
          issues,
          questionCount: pkg.bank.questions.length,
        }
        setResult(parsed)
        setStep('review')
        return
      }
      setError(pkg.error)
      return
    }
    const format = detectFormat(name)
    if (!format) {
      setError('仅支持 .xlsx / .csv / .json 文件或题匣题库包（.tiyu.json）')
      return
    }
    if (text.trim().length === 0) {
      setError('文件内容为空')
      return
    }
    const parsed = format === 'json' ? parseImportJson(text) : parseImportCsv(text)
    setResult(parsed)
    if (parsed.bank) {
      setStep('review')
    }
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`文件过大（${formatBytes(file.size)}），单次导入上限 ${formatBytes(MAX_IMPORT_BYTES)}。请拆分后分批导入。`)
      return
    }
    // Excel 与文本走不同的读取路径：xlsx 是 zip 容器，必须按 ArrayBuffer 解。
    if (detectFormat(file.name) === 'xlsx') {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const parsed = await parseWorkbookFile(reader.result as ArrayBuffer)
          setRawText(`（Excel 文件：${file.name}）`)
          setResult(parsed)
          if (parsed.bank) setStep('review')
        } catch (error) {
          setError(`Excel 解析失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      reader.onerror = () => setError('读取文件失败，请重试')
      reader.readAsArrayBuffer(file)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setRawText(text)
      runParse(text, file.name)
    }
    reader.onerror = () => setError('读取文件失败，请重试')
    reader.readAsText(file, 'utf-8')
  }

  const onPaste = () => {
    // 粘贴内容没有文件名，按内容嗅探格式，避免 CSV 被当作 JSON 解析。
    const format = detectFormatFromContent(rawText)
    runParse(rawText, `粘贴内容.${format}`)
  }

  const commit = () => {
    if (!result?.bank) return
    const now = Date.now()
    const sameTitle = existingBanks.find((bank) => bank.title === result.bank!.title)
    // 同标题时：沿用旧 ID 覆盖（错题与记录仍指向同一题库），或显式新建副本。
    const id =
      sameTitle && overwriteBankId !== 'new'
        ? sameTitle.id
        : normalizeId(result.bank.title, now)
    const bank: ImportedBank = {
      id,
      title: result.bank.title,
      subtitle: result.bank.subtitle,
      description: result.bank.description,
      exam: result.bank.exam,
      icon: result.bank.icon,
      accent: result.bank.accent,
      level: result.bank.level,
      durationMin: result.bank.durationMin,
      tags: result.bank.tags,
      importedAt: now,
      questions: result.bank.questions,
    }
    addBank(bank)
    setSavedId(bank.id)
    setStep('done')
  }

  if (step === 'done') {
    return (
      <div className="import-page">
        <header className="page-head">
          <span className="eyebrow">导入题库</span>
          <h1 className="page-title serif">导入完成</h1>
        </header>
        <EmptyState
          icon={<CircleCheck />}
          title={`已导入 ${result?.questionCount ?? 0} 题`}
          description="题库已保存到本机数据库，可随时在「我的题库」中练习或删除。"
          action={
            <div className="empty-action-row">
              <Link to={`/collection/${savedId}`} className="button button-primary">
                打开这个题库 <ArrowRight />
              </Link>
              <Link to="/library" className="button button-ghost">
                <Library /> 我的题库
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  if (step === 'review' && result?.bank) {
    const blocking = result.issues.filter((issue) => !issue.message.includes('跳过'))
    return (
      <div className="import-page">
        <header className="page-head">
          <span className="eyebrow">导入题库 · 确认</span>
          <h1 className="page-title serif">{result.bank.title}</h1>
          <p className="page-sub">
            共 {result.questionCount} 题
            {result.issues.length > 0 ? ` · ${result.issues.length} 条提示` : ' · 全部通过校验'}
          </p>
        </header>

        <section className="import-summary">
          <div className="import-summary-card">
            <span>题型分布</span>
            <strong className="mono">
              单选 {result.bank.questions.filter((q) => q.type === 'single').length} · 多选{' '}
              {result.bank.questions.filter((q) => q.type === 'multiple').length} · 判断{' '}
              {result.bank.questions.filter((q) => q.type === 'judge').length}
            </strong>
          </div>
          <div className="import-summary-card">
            <span>题库属性</span>
            <strong>
              <Badge tone="accent">{result.bank.exam}</Badge> <Badge tone="neutral">{result.bank.level}</Badge>
            </strong>
          </div>
        </section>

        {existingBanks.some((bank) => bank.title === result.bank!.title) ? (
          <section className="import-conflict">
            <h2 className="serif">已有同名题库</h2>
            <p>
              你已导入过标题为「{result.bank.title}」的题库。覆盖会保留原题库 ID，
              错题与练习记录仍指向它；新建副本则会得到一份独立的题库。
            </p>
            <div className="import-conflict-options">
              <button
                className={`button button-sm ${overwriteBankId !== 'new' ? 'button-primary' : 'button-ghost'}`}
                onClick={() => setOverwriteBankId(null)}
              >
                覆盖原题库
              </button>
              <button
                className={`button button-sm ${overwriteBankId === 'new' ? 'button-primary' : 'button-ghost'}`}
                onClick={() => setOverwriteBankId('new')}
              >
                新建副本
              </button>
            </div>
          </section>
        ) : null}

        {result.issues.length > 0 ? (
          <section className="import-issues">
            <h2 className="serif">校验提示（这些行未导入或已自动修正）</h2>
            <ul>
              {result.issues.map((issue, index) => (
                <li key={issueKey(issue, index)}>
                  <CircleX />
                  <span className="mono">{issue.line > 0 ? `第 ${issue.line} 行` : '格式提示'}</span>
                  <span className="import-issue-field">{issue.field}</span>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
            {blocking.length === result.issues.length && result.questionCount === 0 ? null : null}
          </section>
        ) : (
          <div className="import-all-pass">
            <CircleCheck /> 全部题目通过校验
          </div>
        )}

        <div className="import-actions">
          <button className="button button-ghost" onClick={() => setStep('input')}>
            返回修改
          </button>
          <button className="button button-primary" onClick={commit} disabled={result.questionCount === 0}>
            确认导入 {result.questionCount} 题 <ArrowRight />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="import-page">
      <header className="page-head">
        <span className="eyebrow">导入题库</span>
        <h1 className="page-title serif">把你自己的题目带进来</h1>
        <p className="page-sub">
          支持 JSON 与 CSV 两种格式，逐行校验后才会入库。数据只保存在本机数据库。
          {existingCount > 0 ? ` 已有 ${existingCount} 个导入题库。` : ''}
        </p>
      </header>

      <section className="import-drop">
        <div
          className="import-drop-zone"
          role="button"
          tabIndex={0}
          aria-label="选择或拖入题库文件"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click()
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            onFile(event.dataTransfer.files?.[0])
          }}
        >
          <Upload />
          <strong>点击选择，或把 .xlsx / .csv / .json 文件拖到这里</strong>
          <span>Excel 与 CSV 用同一套列名；单次最多 2000 题，超过 6 个选项请用 JSON 格式</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv,.xlsx,.xls,.tiyu.json,text/csv,application/json"
          className="visually-hidden"
          onChange={(event) => onFile(event.target.files?.[0] ?? undefined)}
        />
        {error ? (
          <p className="import-error" role="alert">
            <CircleX /> {error}
          </p>
        ) : null}
      </section>

      <section className="import-paste">
        <div className="section-head">
          <h2 className="section-title serif">或者直接粘贴 JSON</h2>
          <Link to="/docs" className="text-link" onClick={(event) => event.preventDefault()}>
            格式说明见 docs/IMPORT_FORMAT.md
          </Link>
        </div>
        <textarea
          className="import-textarea mono"
          rows={10}
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder={'{\n  "title": "我的题库",\n  "questions": [\n    {\n      "type": "single",\n      "stem": "题干",\n      "options": ["选项A", "选项B", "选项C", "选项D"],\n      "answer": ["A"],\n      "explanation": "解析"\n    }\n  ]\n}'}
          aria-label="粘贴 JSON 内容"
        />
        <div className="import-actions">
          <button className="button button-ghost" onClick={() => setRawText('')} disabled={!rawText}>
            清空
          </button>
          <button className="button button-primary" onClick={onPaste} disabled={!rawText.trim()}>
            <BookOpen /> 校验并预览
          </button>
        </div>
      </section>
    </div>
  )
}

export function ImportPageIntro() {
  return (
    <Link to="/import" className="import-entry">
      <Upload /> 导入我的题库
    </Link>
  )
}
