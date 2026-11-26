import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { domains } from '../data/taxonomy'
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
import { decryptBankPackage, isEncryptedBankPackage } from '../lib/securePackage'
import { extractDocxText } from '../lib/docxText'
import { extractPdfText, parsePdfImport } from '../lib/pdfText'
import { parseTextImport, TEXT_IMPORT_TEMPLATE } from '../lib/textImport'
import { downloadText } from '../lib/download'
import { parseWorkbookFile } from '../services/xlsxImport'
import { Badge, EmptyState } from '../components/ui/primitives'
import { PageHeader, SectionHeader } from '../components/ui/sections'
import { ArrowRight, BookOpen, CircleCheck, CircleX, Download, Library, Upload } from '../components/ui/icons'

type Step = 'input' | 'unlock' | 'review' | 'done'

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
  const [saving, setSaving] = useState(false)
  const [overwriteBankId, setOverwriteBankId] = useState<string | null>(null)
  const [encryptedText, setEncryptedText] = useState('')
  const [password, setPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [domainId, setDomainId] = useState('')
  const [trackName, setTrackName] = useState('')
  const [templateMessage, setTemplateMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const runParse = (text: string, name: string, formatOverride?: 'text') => {
    setError('')
    setResult(null)
    setOverwriteBankId(null)
    if (isEncryptedBankPackage(text)) {
      setEncryptedText(text)
      setPassword('')
      setStep('unlock')
      return
    }
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
    const format = formatOverride ?? detectFormat(name)
    if (!format || format === 'docx') {
      setError('仅支持 .xlsx / .csv / .json / .docx / .pdf / .txt / .md 文件或题小星题库包（.tixing.json）')
      return
    }
    if (text.trim().length === 0) {
      setError('文件内容为空')
      return
    }
    const parsed = format === 'json'
      ? parseImportJson(text)
      : format === 'text'
        ? parseTextImport(text, name)
        : parseImportCsv(text)
    setResult(parsed)
    if (parsed.bank) {
      setStep('review')
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file || busy) return
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`文件过大（${formatBytes(file.size)}），单次导入上限 ${formatBytes(MAX_IMPORT_BYTES)}。请拆分后分批导入。`)
      return
    }
    setError('')
    setBusy(true)
    setBusyLabel('正在读取文件…')
    let format: ReturnType<typeof detectFormat> = null
    try {
      // Excel / Word / PDF 都不是纯文本：xlsx、docx 是 zip 容器，PDF 要按二进制读。
      format = detectFormat(file.name)
      if (format === 'docx') {
        const buffer = await file.arrayBuffer()
        const text = extractDocxText(buffer)
        setRawText(`（Word 文件：${file.name}）`)
        runParse(text, file.name, 'text')
        return
      }
      if (format === 'xlsx') {
        const parsed = await parseWorkbookFile(await file.arrayBuffer())
        setRawText(`（Excel 文件：${file.name}）`)
        setResult(parsed)
        if (parsed.bank) setStep('review')
        return
      }
      if (format === 'pdf') {
        const extraction = await extractPdfText(await file.arrayBuffer(), {
          onProgress: (readPages, totalPages) => {
            setBusyLabel(`正在读取 PDF：第 ${readPages} / ${totalPages} 页…`)
          },
        })
        if (extraction.text.trim().length === 0) {
          setError(
            `这份 PDF 的 ${extraction.pageCount} 页都没有可提取的文字层，可能是扫描件。题小星暂不内置 OCR；请先用系统 OCR 或扫描工具转成文本，再粘贴或存为 TXT 导入。`,
          )
          return
        }
        setRawText(extraction.text)
        const parsed = parsePdfImport(extraction, file.name)
        setResult(parsed)
        if (parsed.bank) {
          setStep('review')
        } else {
          setError(parsed.issues[0]?.message ?? 'PDF 中没有识别到题目')
        }
        return
      }
      const text = await file.text()
      setRawText(text)
      runParse(text, file.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/password/i.test(message)) {
        setError('这份 PDF 有密码保护，先解除密码后再导入。')
      } else if (format === 'pdf') {
        setError(`PDF 解析失败：${message}`)
      } else if (format === 'docx') {
        setError(`Word 解析失败：${message}`)
      } else if (format === 'xlsx') {
        setError(`Excel 解析失败：${message}`)
      } else {
        setError('读取文件失败，请重试')
      }
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  const unlock = async () => {
    if (unlocking) return
    setUnlocking(true)
    setError('')
    try {
      const plaintext = await decryptBankPackage(encryptedText, password)
      setEncryptedText('')
      setPassword('')
      setRawText(plaintext)
      runParse(plaintext, '解密的题库.tixing.json')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUnlocking(false)
    }
  }

  const onPaste = () => {
    // 粘贴内容没有文件名，按内容嗅探格式，避免 CSV 被当作 JSON 解析。
    const format = detectFormatFromContent(rawText)
    runParse(rawText, `粘贴内容.${format === 'text' ? 'txt' : format}`)
  }

  const downloadTemplate = async () => {
    const result = await downloadText('题小星-文本导入模板.txt', TEXT_IMPORT_TEMPLATE, 'text/plain;charset=utf-8')
    setTemplateMessage(result.ok ? (result.channel === 'native-share' ? '模板已生成，请在系统面板中保存或发送。' : '模板已开始下载。') : `模板导出失败：${result.error}`)
  }

  const commit = async () => {
    if (!result?.bank || saving) return
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
      domainId: domainId ? (domainId as ImportedBank['domainId']) : undefined,
      trackId: trackName.trim() ? `track-${normalizeId(trackName.trim(), 0)}` : undefined,
      trackName: trackName.trim() || undefined,
      questions: result.bank.questions,
    }
    setSaving(true)
    setError('')
    try {
      // 必须等落库真正成功再进入「导入完成」页，
      // 否则用户看到成功提示，重启后题库却不在。
      await addBank(bank)
      setSavedId(bank.id)
      setStep('done')
    } catch (err) {
      setError(
        `保存失败：${err instanceof Error ? err.message : String(err)}。题库尚未写入，请重试。`,
      )
    } finally {
      setSaving(false)
    }
  }

  if (step === 'unlock') {
    return (
      <div className="import-page">
        <PageHeader
          eyebrow="导入题库 · 加密包"
          title="输入分享口令"
          subtitle="这是一个加密题库包。口令只在本机用于解密，不会上传，也不会写入日志。"
        />
        <section className="import-unlock">
          <label>
            <span>分享口令</span>
            <input
              type="password"
              value={password}
              autoComplete="off"
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void unlock()
              }}
              placeholder="至少 8 位"
              aria-label="分享口令"
            />
          </label>
          {error ? (
            <p className="import-error" role="alert">
              <CircleX /> {error}
            </p>
          ) : null}
          <div className="import-actions">
            <button
              className="button button-ghost"
              onClick={() => {
                setStep('input')
                setEncryptedText('')
                setPassword('')
                setError('')
              }}
            >
              取消
            </button>
            <button
              className="button button-primary"
              onClick={() => void unlock()}
              disabled={unlocking || password.length < 8}
            >
              {unlocking ? '解密中…' : '解密并预览'} <ArrowRight />
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="import-page">
        <PageHeader eyebrow="导入题库" title="导入完成" />
        <EmptyState
          icon={<CircleCheck />}
          title={`已导入 ${result?.questionCount ?? 0} 题`}
          description="题库已保存到本机数据库，可随时在「我的题库」中练习或删除。"
          action={
            <div className="empty-action-row">
              <Link to={`/collection/${savedId}`} className="button button-primary">
                打开这个题库 <ArrowRight />
              </Link>
              <Link to="/catalog" className="button button-ghost">
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
    const currentBank = result.bank
    const typeSummary = ([
      ['single', '单选'] as const,
      ['multiple', '多选'] as const,
      ['judge', '判断'] as const,
      ['fill', '填空'] as const,
      ['short', '简答'] as const,
    ])
      .map(([type, short]) => ({ short, count: currentBank.questions.filter((q) => q.type === type).length }))
      .filter((item) => item.count > 0)
      .map((item) => `${item.short} ${item.count}`)
      .join(' · ')
    return (
      <div className="import-page">
        <PageHeader
          eyebrow="导入题库 · 确认"
          title={result.bank.title}
          subtitle={
            <>
              共 {result.questionCount} 题
              {result.issues.length > 0 ? ` · ${result.issues.length} 条提示` : ' · 全部通过校验'}
            </>
          }
        />

        <section className="import-summary">
          <div className="import-summary-card">
            <span>题型分布</span>
            <strong className="mono">
              {typeSummary}
            </strong>
          </div>
          <div className="import-summary-card">
            <span>题库属性</span>
            <strong>
              <Badge tone="accent">{result.bank.exam}</Badge> <Badge tone="neutral">{result.bank.level}</Badge>
            </strong>
          </div>
        </section>

        <section className="import-group">
          <h2 className="serif">归档到哪里</h2>
          <p>不选领域就放进「我的题库」；填分组名后，同名的导入题库会并到同一条轨道。</p>
          <div className="import-group-fields">
            <label>
              <span>领域</span>
              <select value={domainId} onChange={(event) => setDomainId(event.target.value)}>
                <option value="">我的题库（未分组）</option>
                {domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>分组名</span>
              <input
                value={trackName}
                onChange={(event) => setTrackName(event.target.value)}
                placeholder="例如：期中复习、面试八股"
                maxLength={20}
              />
            </label>
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

        {error ? (
          <p className="import-error" role="alert">
            <CircleX /> {error}
          </p>
        ) : null}

        <div className="import-actions">
          <button className="button button-ghost" onClick={() => setStep('input')}>
            返回修改
          </button>
          <button
            className="button button-primary"
            onClick={() => void commit()}
            disabled={result.questionCount === 0 || saving}
          >
            {saving ? '保存中…' : `确认导入 ${result.questionCount} 题`} <ArrowRight />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="import-page">
      <PageHeader
        eyebrow="导入题库"
        title="把你自己的题目带进来"
        subtitle={
          <>
            支持 JSON、CSV、Excel、Word、PDF（文字层）、TXT、Markdown 与题小星题库包（含加密包），逐行校验后才会入库。数据只保存在本机数据库。
            {existingCount > 0 ? ` 已有 ${existingCount} 个导入题库。` : ''}
          </>
        }
      />

      <section className="import-drop">
        <div
          className={`import-drop-zone${busy ? ' is-busy' : ''}`}
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-label="选择或拖入题库文件"
          aria-disabled={busy}
          onClick={() => {
            if (!busy) fileRef.current?.click()
          }}
          onKeyDown={(event) => {
            if (!busy && (event.key === 'Enter' || event.key === ' ')) fileRef.current?.click()
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            void onFile(event.dataTransfer.files?.[0])
          }}
        >
          <Upload />
          <strong>{busy ? busyLabel : '点击选择文件，支持 .xlsx / .csv / .json / .docx / .pdf / .txt / .md；桌面端也可以直接拖入'}</strong>
          <span>Excel 与 CSV 用同一套列名；Word/TXT/MD/PDF 按题号模板解析。PDF 只读文字层，扫描件请先 OCR 成文本。单次最多 2000 题，超过 6 个选项请用 JSON 格式。加密包会自动要求输入口令。</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv,.xlsx,.docx,.pdf,.txt,.md,.markdown,.tixing.json,application/json,text/csv,text/plain,text/markdown,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/octet-stream"
          className="visually-hidden"
          disabled={busy}
          onChange={(event) => {
            void onFile(event.target.files?.[0] ?? undefined)
            // 清空值，修正文件后还能重新选择同一个路径。
            event.target.value = ''
          }}
        />
        {error ? (
          <p className="import-error" role="alert">
            <CircleX /> {error}
          </p>
        ) : null}
      </section>

      <section className="import-pdf-note">
        <span className="eyebrow">PDF</span>
        <strong>只读文字层，不做内置 OCR</strong>
        <p>能复制出文字的 PDF 可以直接导入；扫描件没有文字层，硬识别只会得到空白或乱码。请先用系统 OCR 或扫描工具转成文本，再粘贴或存为 TXT。PDF 单次最多读 60 页。</p>
      </section>

      <section className="import-template">
        <div>
          <span className="eyebrow">文本模板</span>
          <strong>Word / TXT / Markdown 按题号写</strong>
          <p>每道题以「1. 题干」开头，选项用 A-F，答案写「答案：B」，解析写「解析：…」。多选题答案写「A、B、D」。填空题与简答题写「【填空题】」或「【简答题】」，用「参考答案：…」和「关键词：…」作答；简答题没有关键词会被跳过。</p>
        </div>
        <button className="button button-ghost button-sm" onClick={() => void downloadTemplate()}>
          <Download /> 下载模板
        </button>
        {templateMessage ? <p className="import-template-note" role="status">{templateMessage}</p> : null}
      </section>

      <section className="import-paste">
        <SectionHeader
          title="或者直接粘贴题库内容"
          aside={
            <Link to="/docs" className="text-link" onClick={(event) => event.preventDefault()}>
              格式说明见 docs/IMPORT_FORMAT.md
            </Link>
          }
        />
        <textarea
          className="import-textarea mono"
          rows={10}
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder={'也可以直接粘贴题号模板：\n1. 题干\nA. 选项\nB. 选项\n答案：B\n解析：…\n\n或粘贴 JSON：\n{\n  "title": "我的题库",\n  "questions": [\n    {\n      "type": "single",\n      "stem": "题干",\n      "options": ["选项A", "选项B", "选项C", "选项D"],\n      "answer": ["A"],\n      "explanation": "解析"\n    }\n  ]\n}'}
          aria-label="粘贴题库内容"
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
