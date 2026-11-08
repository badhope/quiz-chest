import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { Question } from '../data/types'
import { LETTERS, typeLabel } from '../lib/quiz'
import { EmptyState } from '../components/ui/primitives'
import { ArrowLeft, Layers, Printer } from '../components/ui/icons'

interface PrintState {
  questions: Question[]
  title: string
  durationMin?: number
}

/**
 * 打印页。
 *
 * 老师最常做的是「组一套卷、打印出来发给学生」，而在答题器里塞打印样式会
 * 把考试交互和静态排版搅在一起。这里单独一页只负责静态排版：
 * 一份是学生用的卷面（不显示答案），一份是教师用的答案页。
 *
 * 打印样式全部走 `@media print`，屏幕上看到的是带操作栏的预览。
 */
export function PrintPage() {
  const location = useLocation()
  const state = location.state as PrintState | null
  const [withAnswers, setWithAnswers] = useState(false)

  if (!state || !Array.isArray(state.questions) || state.questions.length === 0) {
    return (
      <div className="print-page">
        <EmptyState
          icon={<Layers />}
          title="没有可打印的试卷"
          description="请先在「自定义组卷」生成一份试卷，再选择打印。"
          action={
            <Link to="/compose" className="button button-primary button-sm">
              去组卷
            </Link>
          }
        />
      </div>
    )
  }

  const { questions, title, durationMin } = state

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <Link to="/compose" className="button button-ghost button-sm">
          <ArrowLeft /> 返回组卷
        </Link>
        <label className="print-toggle">
          <input
            type="checkbox"
            checked={withAnswers}
            onChange={(event) => setWithAnswers(event.target.checked)}
          />
          附带答案与解析
        </label>
        <button className="button button-primary button-sm" onClick={() => window.print()}>
          <Printer /> 打印 / 存为 PDF
        </button>
      </div>

      <article className="print-sheet">
        <header className="print-head">
          <h1 className="serif">{title}</h1>
          <div className="print-meta">
            <span>共 {questions.length} 题</span>
            {durationMin ? <span>建议用时 {durationMin} 分钟</span> : null}
            <span>姓名：__________</span>
            <span>得分：__________</span>
          </div>
        </header>

        <ol className="print-questions">
          {questions.map((question, index) => (
            <li key={question.id} className="print-question">
              <div className="print-stem">
                <span className="print-index mono">{index + 1}.</span>
                <span>
                  {question.stem}
                  <span className="print-type">
                    （{typeLabel(question.type)}，{question.options.length} 个选项）
                  </span>
                </span>
              </div>
              <div className="print-options">
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="print-option">
                    <span className="print-letter mono">{LETTERS[optionIndex]}.</span>
                    <span>{option}</span>
                  </div>
                ))}
              </div>
              {withAnswers ? (
                <div className="print-answer">
                  <strong>答案：{question.answer.map((value) => LETTERS[value]).join('、')}</strong>
                  {question.explanation ? <p>{question.explanation}</p> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        <footer className="print-foot">
          题匣 · QuizChest — 本卷由本机题库生成，题目内容归创建者所有
        </footer>
      </article>
    </div>
  )
}
