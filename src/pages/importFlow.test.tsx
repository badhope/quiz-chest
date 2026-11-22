// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ImportPage } from './ImportPage'
import { attachRepositoryForTest, useAppStore } from '../store/useAppStore'
import { createMemoryRepository } from '../services/dataLayer'
import { DEFAULT_SETTINGS } from '../services/repository'

const sample = JSON.stringify({
  title: '落库失败题库',
  questions: [
    {
      type: 'single',
      stem: '1 + 1 等于几？',
      options: ['1', '2'],
      answer: ['B'],
      explanation: '基础算术，1 + 1 = 2。',
    },
  ],
})

function reset(): void {
  useAppStore.setState({
    settings: { ...DEFAULT_SETTINGS },
    favorites: [],
    wrongBook: {},
    history: [],
    daily: {},
    lastCollectionId: null,
    banks: [],
    banksVersion: 0,
    papers: [],
    pendingSession: null,
    hydration: 'idle',
    hydrationError: null,
    persistenceError: null,
  })
}

describe('导入页落库边界', () => {
  beforeEach(() => reset())
  afterEach(() => attachRepositoryForTest(null))

  it('落库失败时停在确认页并提示，不进入导入完成', async () => {
    attachRepositoryForTest({
      ...createMemoryRepository(),
      async upsertBank() {
        throw new Error('磁盘已满')
      },
    })

    render(
      <MemoryRouter>
        <ImportPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('粘贴 JSON 内容'), { target: { value: sample } })
    fireEvent.click(screen.getByRole('button', { name: /校验并预览/ }))
    fireEvent.click(await screen.findByRole('button', { name: /确认导入/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('保存失败')
    })
    expect(screen.queryByText('导入完成')).not.toBeInTheDocument()
  })
})
