import type { ExamResult } from '../../data/records'
import { typeLabel } from '../../lib/quiz'
import { EXAM_POINT_LABELS } from '../../lib/exam'
import { Award } from '../ui/icons'

/**
 * 模考结算面板。
 *
 * 分数、及格线、按题型拆开的得分都放在同一块，避免用户在结果页用
 * 正确率反推自己「到底过没过」。进度条上的刻线是及格线，不是掌握线。
 */
export function ExamReport({ result }: { result: ExamResult }) {
  const scorePercent = result.fullScore > 0 ? (result.score / result.fullScore) * 100 : 0
  const passPercent = result.fullScore > 0 ? (result.passScore / result.fullScore) * 100 : 0

  return (
    <section className="exam-report">
      <div className="exam-report-head">
        <div>
          <span className="eyebrow">模考结算</span>
          <h2 className="serif">按题型赋分</h2>
        </div>
        <span className={`exam-verdict ${result.passed ? 'pass' : 'fail'}`}>
          <Award />
          {result.passed ? '已过及格线' : '未到及格线'}
        </span>
      </div>

      <div className="exam-scale">
        <div className="exam-scale-track">
          <span style={{ width: `${scorePercent}%` }} />
          <i style={{ left: `${passPercent}%` }} />
        </div>
        <div className="exam-scale-labels">
          <span>0</span>
          <span className="exam-scale-pass" style={{ left: `${passPercent}%` }}>
            及格线 {result.passScore} 分
          </span>
          <span>满分 {result.fullScore} 分</span>
        </div>
      </div>

      <div className="exam-type-list">
        {result.types.map((item) => {
          const typePercent = item.fullScore > 0 ? (item.score / item.fullScore) * 100 : 0
          return (
            <div className="exam-type-row" key={item.type}>
              <span className="exam-type-name">
                {typeLabel(item.type)}
                <small>
                  {EXAM_POINT_LABELS[item.type]} · {item.correct}/{item.total} 题
                </small>
              </span>
              <div className="exam-type-bar" aria-hidden="true">
                <span style={{ width: `${typePercent}%` }} />
              </div>
              <span className="exam-type-score mono">
                {item.score} / {item.fullScore}
              </span>
            </div>
          )
        })}
      </div>

      <p className="exam-rule">
        单选 2 分、多选 3 分、判断 1 分、填空 2 分、简答 4 分；及格线为满分的 60%，
        未作答按 0 分计。
      </p>
    </section>
  )
}
