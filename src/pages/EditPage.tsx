import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { buildQuestionSeed, type ImportIssue } from '../lib/importer'
import type { QuestionType } from '../data/types'
import { Badge, EmptyState } from '../components/ui/primitives'
import { ArrowLeft, CircleCheck, CircleX, Layers, RotateCcw, Save, Trash2 } from '../components/ui/icons'

/**
 * 题库编辑器（仅导入题库）。
 *
 * 为什么不做增删/排序：题目 ID 是 `{题库ID}-{序号}`，错题本与收藏都按 ID 引用。
 * 一旦插入或删除题目，后面的题目全部重新编号，用户的错题记录会指到错误的题。
 * 所以 v1 只允许原地改内容，不改题量与顺序 —— ID 全部保持稳定。
 */

interface DraftQuestion {
  type: QuestionType
  stem: string
  options: string[]
  answer: number[]
  explanation: string
  difficulty: 1 | 2 | 3
  tags: string
}

const TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
}

/** 编辑器分批渲染的步长。 */
const VISIBLE_BATCH = 50

export function EditPage() {
  const { collectionId = '' } = useParams()
  const bank = useAppStore((state) => state.banks.find((item) => item.id === collectionId))
  const addBank = useAppStore((state) => state.addBank)
  const archiveBankVersion = useAppStore((state) => state.archiveBankVersion)
  const bankSnapshots = useAppStore((state) => state.bankSnapshots)
  const rollbackBankVersion = useAppStore((state) => state.rollbackBankVersion)
  const removeBankSnapshot = useAppStore((state) => state.removeBankSnapshot)
  const banksVersion = useAppStore((state) => state.banksVersion)

  const [title, setTitle] = useState(bank?.title ?? '')
  const [exam, setExam] = useState(bank?.exam ?? '')
  const [description, setDescription] = useState(bank?.description ?? '')
  const [drafts, setDrafts] = useState<DraftQuestion[]>(() =>
    (bank?.questions ?? []).map((question) => ({
      type: question.type,
      stem: question.stem,
      options: [...question.options],
      answer: [...question.answer],
      explanation: question.explanation,
      difficulty: question.difficulty,
      tags: question.tags.join('、'),
    })),
  )
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // 一次渲染多少题。每题有 6~12 个输入控件，全量渲染上千题会明显卡顿。
  const [visibleCount, setVisibleCount] = useState(VISIBLE_BATCH)

  const ownSnapshots = useMemo(
    () => bankSnapshots.filter((item) => item.bankId === collectionId).sort((a, b) => b.savedAt - a.savedAt),
    [bankSnapshots, collectionId],
  )

  const rollback = async (snapshotId: string) => {
    try {
      await rollbackBankVersion(snapshotId)
      setSaved(true)
      setSaveError('')
      // 回滚后草稿要跟着变，否则界面还停留在被覆盖前的内容。
      const restored = useAppStore.getState().banks.find((item) => item.id === collectionId)
      if (restored) {
        setTitle(restored.title)
        setExam(restored.exam)
        setDescription(restored.description)
        setDrafts(
          restored.questions.map((question) => ({
            type: question.type,
            stem: question.stem,
            options: [...question.options],
            answer: [...question.answer],
            explanation: question.explanation,
            difficulty: question.difficulty,
            tags: question.tags.join('、'),
          })),
        )
      }
    } catch (error) {
      setSaveError(`回滚失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const issuesByQuestion = useMemo(() => {
    const map = new Map<number, ImportIssue[]>()
    drafts.forEach((draft, index) => {
      const issues: ImportIssue[] = []
      const seed = buildQuestionSeed(draftToRow(draft), index + 1, issues)
      if (!seed && issues.length === 0) {
        issues.push({ line: index + 1, field: 'row', message: '题目数据无效' })
      }
      if (issues.length > 0) map.set(index, issues)
    })
    return map
  }, [drafts])

  if (!bank) {
    return (
      <div className="edit-page">
        <EmptyState
          icon={<Layers />}
          title="找不到这个题库"
          description="内置示例题库不支持编辑，只有你导入的题库可以修改。"
          action={
            <Link to="/library" className="button button-primary button-sm">
              返回我的题库
            </Link>
          }
        />
      </div>
    )
  }

  const errorCount = issuesByQuestion.size
  const canSave = errorCount === 0 && drafts.length > 0

  const patchQuestion = (index: number, patch: Partial<DraftQuestion>) => {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    )
    setSaved(false)
  }

  const setAnswer = (index: number, optionIndex: number) => {
    const draft = drafts[index]
    if (draft.type === 'multiple') {
      const next = draft.answer.includes(optionIndex)
        ? draft.answer.filter((value) => value !== optionIndex)
        : [...draft.answer, optionIndex].sort((a, b) => a - b)
      patchQuestion(index, { answer: next })
      return
    }
    // 单选与判断只允许一个答案。
    patchQuestion(index, { answer: [optionIndex] })
  }

  const setType = (index: number, type: QuestionType) => {
    const draft = drafts[index]
    if (type === 'judge') {
      patchQuestion(index, {
        type,
        options: [draft.options[0] ?? '对', draft.options[1] ?? '错'].slice(0, 2),
        answer: [0],
      })
      return
    }
    patchQuestion(index, { type })
  }

  const setOptionCount = (index: number, count: number) => {
    const draft = drafts[index]
    const options = Array.from({ length: count }, (_, i) => draft.options[i] ?? '')
    patchQuestion(index, {
      options,
      answer: draft.answer.filter((value) => value < count),
    })
  }

  const save = async () => {
    if (!canSave) return
    const issues: ImportIssue[] = []
    const questions = drafts.map((draft, index) => {
      const seed = buildQuestionSeed(draftToRow(draft), index + 1, issues)
      if (!seed) throw new Error(`第 ${index + 1} 题校验失败`)
      return seed
    })
    setSaving(true)
    setSaveError('')
    try {
      // 保存前把「当前这份」压进历史：用户改错了可以回滚。
      // 只有内容真的变了才存档，避免连续点保存产生一堆相同版本。
      const changed =
        bank.title !== (title.trim() || bank.title) ||
        bank.exam !== (exam.trim() || bank.exam) ||
        bank.description !== (description.trim() || bank.description) ||
        JSON.stringify(bank.questions) !== JSON.stringify(questions)
      if (changed) archiveBankVersion(bank)
      // 沿用原 ID 与 importedAt：错题本、收藏、练习记录的引用不断。
      // 必须 await：落库失败时不能显示「已保存」。
      await addBank({
        id: bank.id,
        title: title.trim() || bank.title,
        subtitle: bank.subtitle,
        description: description.trim() || bank.description,
        exam: exam.trim() || title.trim() || bank.exam,
        icon: bank.icon,
        accent: bank.accent,
        level: bank.level,
        durationMin: bank.durationMin,
        tags: bank.tags,
        importedAt: bank.importedAt,
        questions,
      })
      setSaved(true)
    } catch (error) {
      setSaved(false)
      setSaveError(
        `保存失败：${error instanceof Error ? error.message : String(error)}。改动仍在界面上，可重试。`,
      )
    } finally {
      setSaving(false)
    }
  }

  void banksVersion

  return (
    <div className="edit-page">
      <header className="page-head">
        <div className="page-head-row">
          <Link to={`/collection/${bank.id}`} className="button button-ghost button-sm">
            <ArrowLeft /> 返回题库
          </Link>
        </div>
        <span className="eyebrow">编辑题库</span>
        <h1 className="page-title serif">修改「{bank.title}」</h1>
        <p className="page-sub">
          只能改内容，不能增删或调序——题目编号被错题本引用，改了会串题。
        </p>
      </header>

      {ownSnapshots.length > 0 ? (
        <section className="edit-history">
          <details>
            <summary>
              <strong>历史版本（{ownSnapshots.length}）</strong>
              <span>每次保存前的旧内容都会自动存档，可随时回滚</span>
            </summary>
            <ul>
              {ownSnapshots.map((snapshot) => (
                <li key={snapshot.id}>
                  <div>
                    <strong className="mono">v{snapshot.revision}</strong>
                    <span>{new Date(snapshot.savedAt).toLocaleString('zh-CN')}</span>
                    <span className="edit-history-meta">
                      {snapshot.bank.title} · {snapshot.bank.questions.length} 题
                    </span>
                  </div>
                  <div className="edit-history-actions">
                    <button
                      className="button button-ghost button-sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            `回滚到 v${snapshot.revision}？当前内容会先存为新的历史版本。`,
                          )
                        ) {
                          void rollback(snapshot.id)
                        }
                      }}
                    >
                      <RotateCcw /> 回滚
                    </button>
                    <button
                      className="button button-ghost button-sm"
                      onClick={() => removeBankSnapshot(snapshot.id)}
                      aria-label={`删除 v${snapshot.revision} 历史版本`}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      <section className="edit-meta">
        <label>
          <span>题库名称</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>所属考试 / 用途</span>
          <input value={exam} onChange={(event) => setExam(event.target.value)} />
        </label>
        <label>
          <span>描述</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </section>

      {drafts.length > VISIBLE_BATCH ? (
        <section className="edit-batch">
          <div>
            <strong>共 {drafts.length} 题，当前显示前 {visibleCount} 题</strong>
            <p>
              一次渲染全部题目会让浏览器卡住（每题有多个输入控件）。分批显示不影响保存：
              保存时处理的是全部 {drafts.length} 题。
            </p>
          </div>
          {visibleCount < drafts.length ? (
            <button
              className="button button-ghost button-sm"
              onClick={() => setVisibleCount((value) => Math.min(drafts.length, value + VISIBLE_BATCH))}
            >
              再显示 {Math.min(VISIBLE_BATCH, drafts.length - visibleCount)} 题
            </button>
          ) : null}
        </section>
      ) : null}

      {drafts.slice(0, visibleCount).map((draft, index) => {
        const issues = issuesByQuestion.get(index) ?? []
        return (
          <section key={index} className={`edit-question${issues.length > 0 ? ' has-error' : ''}`}>
            <header className="edit-question-head">
              <strong className="mono">第 {index + 1} 题</strong>
              <div className="edit-question-tools">
                {(['single', 'multiple', 'judge'] as QuestionType[]).map((type) => (
                  <button
                    key={type}
                    className={`chip${draft.type === type ? ' active' : ''}`}
                    onClick={() => setType(index, type)}
                  >
                    {TYPE_LABEL[type]}
                  </button>
                ))}
                {draft.type !== 'judge' ? (
                  <select
                    value={draft.options.length}
                    onChange={(event) => setOptionCount(index, Number(event.target.value))}
                    aria-label="选项数量"
                  >
                    {[2, 3, 4, 5, 6].map((count) => (
                      <option key={count} value={count}>
                        {count} 个选项
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </header>

            <textarea
              className="edit-stem"
              value={draft.stem}
              rows={2}
              placeholder="题干"
              aria-label={`第 ${index + 1} 题题干`}
              onChange={(event) => patchQuestion(index, { stem: event.target.value })}
            />

            <div className="edit-options">
              {draft.options.map((option, optionIndex) => (
                <label key={optionIndex} className="edit-option">
                  <input
                    type={draft.type === 'multiple' ? 'checkbox' : 'radio'}
                    name={`answer-${index}`}
                    checked={draft.answer.includes(optionIndex)}
                    onChange={() => setAnswer(index, optionIndex)}
                    aria-label={`把选项 ${String.fromCharCode(65 + optionIndex)} 设为答案`}
                  />
                  <span className="mono">{String.fromCharCode(65 + optionIndex)}</span>
                  <input
                    value={option}
                    onChange={(event) =>
                      patchQuestion(index, {
                        options: draft.options.map((value, i) =>
                          i === optionIndex ? event.target.value : value,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>

            <label className="edit-explanation">
              <span>解析（至少 4 个字符）</span>
              <textarea
                value={draft.explanation}
                rows={2}
                onChange={(event) => patchQuestion(index, { explanation: event.target.value })}
              />
            </label>

            {issues.length > 0 ? (
              <ul className="edit-issues">
                {issues.map((issue, issueIndex) => (
                  <li key={issueIndex}>
                    <CircleX /> {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        )
      })}

      <div className="edit-actions">
        <div>
          {errorCount > 0 ? (
            <span className="edit-warn" role="alert">
              <CircleX /> {errorCount} 题未通过校验，修正后才能保存
            </span>
          ) : (
            <span className="edit-ok">
              <CircleCheck /> 全部通过校验
            </span>
          )}
        </div>
        <button
          className="button button-primary"
          disabled={!canSave || saving}
          onClick={() => void save()}
        >
          <Save /> {saving ? '正在保存…' : '保存修改'}
        </button>
      </div>
      {saveError ? (
        <p className="edit-error" role="alert">
          <CircleX /> {saveError}
        </p>
      ) : null}
      {saved ? (
        <p className="edit-saved" role="status">
          <Badge tone="success">已保存，题库内容与编号均已更新</Badge>
        </p>
      ) : null}
    </div>
  )
}

/** 编辑器字段 → 与 CSV 行相同的形状，从而复用同一套校验规则。 */
function draftToRow(draft: DraftQuestion): Record<string, unknown> {
  const row: Record<string, unknown> = {
    stem: draft.stem,
    answer: draft.answer.map((value) => String.fromCharCode(65 + value)).join(','),
    explanation: draft.explanation,
    type: draft.type,
    difficulty: draft.difficulty,
    tags: draft.tags,
  }
  draft.options.forEach((option, index) => {
    row[`option${String.fromCharCode(65 + index)}`] = option
  })
  return row
}
