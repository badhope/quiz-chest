// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MissingPage } from './MissingPage'

describe('MissingPage', () => {
  it('渲染标题、说明与返回链接', () => {
    render(
      <MemoryRouter>
        <MissingPage
          icon={<span>icon</span>}
          title="题库不存在"
          description="链接可能已过期。"
          to="/catalog"
          linkLabel="返回题库总览"
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('题库不存在')).toBeInTheDocument()
    expect(screen.getByText('链接可能已过期。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回题库总览' })).toHaveAttribute('href', '/catalog')
  })
})
