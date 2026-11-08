import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { domains } from '../../data/taxonomy'
import { searchCatalog } from '../../lib/search'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { Chip } from './Chip'
import { DomainIcon, Search, X } from '../ui/icons'

const hotTags = ['JavaScript', '考研', '雅思', '初级会计', '行测', '中考']

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useDialogFocus(panelRef, { open: true, onClose, initialFocus: inputRef })

  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  const results = useMemo(() => searchCatalog(query), [query])

  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  const hasResults = results.collections.length > 0 || results.questions.length > 0

  return (
    <div className="search-layer" role="presentation" onClick={onClose}>
      <div
        className="search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="搜索题库"
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="search-input-row">
          <Search />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索题库、考点、题干关键词…"
            aria-label="搜索题库"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results.collections[0]) {
                go(`/collection/${results.collections[0].id}`)
              }
            }}
          />
          <button className="icon-button" onClick={onClose} aria-label="关闭搜索">
            <X />
          </button>
        </div>

        <div className="search-body">
          {!query.trim() ? (
            <>
              <div className="search-section">
                <span className="search-label">热门搜索</span>
                <div className="chip-row">
                  {hotTags.map((tag) => (
                    <Chip key={tag} onClick={() => setQuery(tag)}>
                      {tag}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="search-section">
                <span className="search-label">按领域浏览</span>
                <div className="search-domains">
                  {domains.map((domain) => (
                    <button
                      key={domain.id}
                      className="search-domain"
                      onClick={() => go(`/domain/${domain.id}`)}
                    >
                      <span
                        className="search-domain-mark"
                        style={{ background: domain.accent }}
                      >
                        <DomainIcon name={domain.icon} />
                      </span>
                      <span>
                        <strong>{domain.name}</strong>
                        <small>{domain.tagline}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : hasResults ? (
            <>
              {results.collections.length > 0 ? (
                <div className="search-section">
                  <span className="search-label">题库</span>
                  {results.collections.map((collection) => (
                    <button
                      key={collection.id}
                      className="search-result"
                      onClick={() => go(`/collection/${collection.id}`)}
                    >
                      <span className="search-result-icon">
                        <DomainIcon name={collection.icon} />
                      </span>
                      <span className="search-result-text">
                        <strong>{collection.title}</strong>
                        <small>
                          {collection.exam} · {collection.questions.length} 题
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {results.questions.length > 0 ? (
                <div className="search-section">
                  <span className="search-label">题目</span>
                  {results.questions.map((question) => {
                    const collection = results.collections.find(
                      (item) => item.id === question.collectionId,
                    )
                    return (
                      <button
                        key={question.id}
                        className="search-result"
                        onClick={() => go(`/collection/${question.collectionId}`)}
                      >
                        <span className="search-result-icon">
                          <Search />
                        </span>
                        <span className="search-result-text">
                          <strong>{question.stem}</strong>
                          <small>{collection?.title}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <div className="search-empty">
              <p>没有找到与“{query}”相关的内容</p>
              <span>试试更短的关键词，或直接浏览分类</span>
            </div>
          )}
        </div>
        <div className="search-foot">
          <span>
            <kbd>Enter</kbd> 打开首个结果
          </span>
          <span>
            <kbd>Esc</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  )
}
