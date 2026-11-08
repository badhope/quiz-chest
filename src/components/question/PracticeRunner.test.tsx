// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Question } from '../../data/types'
import { PracticeRunner } from './PracticeRunner'

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    collectionId: 'bank-1',
    type: 'single',
    stem: '以下哪个是质数？',
    options: ['4', '7', '9', '15'],
    answer: [1],
    explanation: '7 只能被 1 和自身整除。',
    difficulty: 1,
    tags: ['数学'],
    ...overrides,
  }
}

function renderRunner(questions: Question[], mode: 'practice' | 'exam' | 'review' = 'practice') {
  return render(
    <MemoryRouter initialEntries={['/practice/bank-1']}>
      <Routes>
        <Route
          path="/practice/:collectionId"
          element={
            <PracticeRunner
              questions={questions}
              title="示例题库"
              mode={mode}
              historyCollectionId="bank-1"
              historyTitle="示例题库"
              backTo="/collection/bank-1"
            />
          }
        />
        <Route path="/result/:collectionId" element={<div>结果页</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PracticeRunner', () => {
  it('renders the question stem and all options', () => {
    renderRunner([makeQuestion()])
    expect(screen.getByText('以下哪个是质数？')).toBeInTheDocument()
    for (const option of ['4', '7', '9', '15']) {
      expect(screen.getByText(option)).toBeInTheDocument()
    }
  })

  it('marks a correct answer as correct after submitting', async () => {
    const user = userEvent.setup()
    renderRunner([makeQuestion()])

    await user.click(screen.getByText('7'))
    await user.click(screen.getByRole('button', { name: /确认答案/ }))

    expect(await screen.findByText('回答正确')).toBeInTheDocument()
  })

  it('marks a wrong answer as wrong and reveals the correct option', async () => {
    const user = userEvent.setup()
    renderRunner([makeQuestion()])

    await user.click(screen.getByText('4'))
    await user.click(screen.getByRole('button', { name: /确认答案/ }))

    expect(await screen.findByText('回答错误')).toBeInTheDocument()
    expect(screen.getByText('正确答案：')).toBeInTheDocument()
  })

  it('keeps the submit button disabled until an option is selected', () => {
    renderRunner([makeQuestion()])
    expect(screen.getByRole('button', { name: /确认答案/ })).toBeDisabled()
  })

  it('does not reveal the analysis in exam mode before submitting', async () => {
    const user = userEvent.setup()
    renderRunner([makeQuestion()], 'exam')

    await user.click(screen.getByText('7'))
    expect(screen.queryByText('回答正确')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /确认答案/ })).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no questions', () => {
    renderRunner([])
    expect(screen.getByText('这里暂时没有题目')).toBeInTheDocument()
  })

  it('navigates to the result page after confirming submission', async () => {
    const user = userEvent.setup()
    renderRunner([makeQuestion()])

    await user.click(screen.getByText('7'))
    await user.click(screen.getByRole('button', { name: /确认答案/ }))
    await user.click(screen.getByRole('button', { name: '交卷' }))
    await user.click(screen.getByRole('button', { name: /提交并查看结果/ }))

    expect(await screen.findByText('结果页')).toBeInTheDocument()
  })

  it('supports multiple-choice questions with combined selection', async () => {
    const user = userEvent.setup()
    const multiple = makeQuestion({
      id: 'q2',
      type: 'multiple',
      stem: '以下哪些是偶数？',
      options: ['2', '3', '4', '5'],
      answer: [0, 2],
    })
    renderRunner([multiple])

    await user.click(screen.getByText('2'))
    await user.click(screen.getByText('4'))
    await user.click(screen.getByRole('button', { name: /确认答案/ }))

    expect(await screen.findByText('回答正确')).toBeInTheDocument()
  })
})
