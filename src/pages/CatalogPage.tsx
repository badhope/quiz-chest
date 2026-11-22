import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLibraryCollections } from '../lib/library'
import { domains, tracksOfDomain } from '../data/taxonomy'
import type { Domain, IconKey } from '../data/types'
import { DomainIcon } from '../components/ui/icons'
import { Badge, EmptyState } from '../components/ui/primitives'
import { ChevronRight, Clock, Library, Search } from '../components/ui/icons'

export function CatalogPage() {
  const library = useLibraryCollections()
  const [domainFilter, setDomainFilter] = useState<string>(domains[0].id)
  const [trackFilter, setTrackFilter] = useState<string>('all')
  const [query, setQuery] = useState('')

  const domain = domains.find((item) => item.id === domainFilter) ?? domains[0]
  const tracks = tracksOfDomain(domain.id)
  const keyword = query.trim().toLowerCase()

  const domainId = domain.id

  const matched = library.filter((collection) => {
    if (collection.domainId !== domainId) return false
    if (trackFilter !== 'all' && collection.trackId !== trackFilter) return false
    if (!keyword) return true
    return [collection.title, collection.subtitle, collection.exam, ...collection.tags]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })

  const searchHits = !keyword
    ? []
    : library
        .filter((collection) =>
          [collection.title, collection.subtitle, collection.exam, ...collection.tags]
            .join(' ')
            .toLowerCase()
            .includes(keyword),
        )
        .slice(0, 8)

  const countOfTrack = (trackId: string) =>
    library.filter((item) => item.domainId === domain.id && item.trackId === trackId).length

  return (
    <div className="tree-page">
      <header className="tree-head">
        <div>
          <span className="eyebrow">题库总览</span>
          <h1 className="page-title serif">先选领域，再选学段，最后挑题库</h1>
        </div>
        <label className="tree-search">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="直接搜题库、考试或考点"
            aria-label="搜索题库"
          />
        </label>
      </header>

      {keyword ? (
        <section className="tree-search-result">
          <div className="tree-search-head">
            <span>
              “{query}” 命中 {searchHits.length} 个题库
            </span>
            <button className="text-link" onClick={() => setQuery('')}>
              清除
            </button>
          </div>
          {searchHits.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title="没有匹配的题库"
              description="换个关键词试试，比如「高数」「教资」「一建」。"
            />
          ) : (
            <div className="tree-search-list">
              {searchHits.map((collection) => {
                const owner = domains.find((item) => item.id === collection.domainId)
                return (
                  <Link
                    key={collection.id}
                    to={`/collection/${collection.id}`}
                    className="tree-search-row"
                  >
                    <span className="tree-search-icon">
                      <DomainIcon name={collection.icon} />
                    </span>
                    <span className="tree-search-text">
                      <strong>{collection.title}</strong>
                      <small>
                        {owner?.name} · {collection.exam}
                      </small>
                    </span>
                    <span className="tree-search-count mono">
                      {collection.questions.length} 题
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      ) : (
        <div className="tree-layout">
          <nav className="tree-nav" aria-label="领域与学段">
            <span className="tree-nav-label">领域</span>
            {[...domains, ...(library.some((item) => item.domainId === 'imported')
              ? [{
                  id: 'imported' as Domain['id'],
                  name: '我的题库',
                  icon: 'book' as IconKey,
                  accent: '#7A5C2E',
                }]
              : [])].map((item) => {
              const active = item.id === domain.id
              const owned = library.filter((collection) => collection.domainId === item.id)
              return (
                <div key={item.id} className="tree-group">
                  <button
                    className={`tree-domain${active ? ' active' : ''}`}
                    onClick={() => {
                      setDomainFilter(item.id)
                      setTrackFilter('all')
                    }}
                    aria-expanded={active}
                  >
                    <DomainIcon name={item.icon} />
                    <span>{item.name}</span>
                    <span className="tree-count mono">{owned.length}</span>
                  </button>
                  {active ? (
                    <div className="tree-tracks">
                      <button
                        className={`tree-track${trackFilter === 'all' ? ' active' : ''}`}
                        onClick={() => setTrackFilter('all')}
                      >
                        全部
                        <span className="mono">{owned.length}</span>
                      </button>
                      {tracksOfDomain(item.id).map((track) => (
                        <button
                          key={track.id}
                          className={`tree-track${trackFilter === track.id ? ' active' : ''}`}
                          onClick={() => setTrackFilter(track.id)}
                        >
                          {track.name}
                          <span className="mono">{countOfTrack(track.id)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </nav>

          <section className="tree-content">
            <header
              className="tree-domain-head"
              style={{ '--domain-accent': domain.accent } as React.CSSProperties}
            >
              <span className="tree-domain-mark">
                <DomainIcon name={domain.icon} />
              </span>
              <div>
                <span className="eyebrow">
                  {domain.index} / {domain.en}
                </span>
                <h2 className="serif">{domain.name}</h2>
                <p>{domain.description}</p>
              </div>
              <Link to={`/domain/${domain.id}`} className="text-link">
                看领域页 <ChevronRight />
              </Link>
            </header>

            {matched.length === 0 ? (
              <EmptyState
                icon={<Library />}
                title="这个筛选下没有题库"
                description="换一个学段，或回到「全部」查看该领域所有题库。"
                action={
                  <button
                    className="button button-primary button-sm"
                    onClick={() => setTrackFilter('all')}
                  >
                    查看全部
                  </button>
                }
              />
            ) : (
              <div className="tree-collections">
                {matched.map((collection) => {
                  const track = tracks.find((item) => item.id === collection.trackId)
                  return (
                    <Link
                      key={collection.id}
                      to={`/collection/${collection.id}`}
                      className="tree-collection"
                      style={{ '--card-accent': domain.accent } as React.CSSProperties}
                    >
                      <div className="tree-collection-head">
                        <span className="tree-collection-icon">
                          <DomainIcon name={collection.icon} />
                        </span>
                        {track ? <Badge tone="neutral">{track.name}</Badge> : null}
                        <Badge tone="neutral">{collection.level}</Badge>
                        {collection.origin === 'builtin' ? (
                          <Badge tone="gold" outline>
                            示例
                          </Badge>
                        ) : null}
                      </div>
                      <h3 className="serif">{collection.title}</h3>
                      <p>{collection.subtitle}</p>
                      <div className="tree-collection-foot">
                        <span>
                          <Library /> {collection.questions.length} 题
                        </span>
                        <span>
                          <Clock /> {collection.durationMin} 分钟
                        </span>
                        <ChevronRight />
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export function DomainPage() {
  const { domainId = '' } = useParams()
  const library = useLibraryCollections()
  const importedDomain: Domain | null =
    domainId === 'imported' && library.some((item) => item.domainId === 'imported')
      ? {
          id: 'imported',
          name: '我的题库',
          en: 'My Bank',
          tagline: '导入与自建',
          description: '你自己导入的题库，数据保存在本机，可随时删除。',
          icon: 'book',
          accent: '#7A5C2E',
          index: 'MY',
        }
      : null
  const domain = importedDomain ?? domains.find((item) => item.id === domainId)
  if (!domain) {
    return (
      <EmptyState
        icon={<Library />}
        title="领域不存在"
        description="该分类可能已被调整，请返回题库总览重新选择。"
        action={
          <Link to="/catalog" className="button button-primary button-sm">
            返回题库总览
          </Link>
        }
      />
    )
  }

  const owned = library.filter((collection) => collection.domainId === domain.id)
  const tracks = domain.id === 'imported'
    ? [{ id: 'imported', domainId: 'imported' as const, name: '全部导入', short: '导入', description: '所有导入的题库' }]
    : tracksOfDomain(domain.id)
  const count = owned.reduce((sum, item) => sum + item.questions.length, 0)

  return (
    <div
      className="domain-page"
      style={{ '--domain-accent': domain.accent } as React.CSSProperties}
    >
      <header className="domain-hero">
        <div className="domain-hero-mark">
          <DomainIcon name={domain.icon} />
        </div>
        <div className="domain-hero-text">
          <span className="eyebrow">
            {domain.index} / {domain.en}
          </span>
          <h1 className="page-title serif">{domain.name}</h1>
          <p className="page-sub">{domain.description}</p>
          <div className="domain-hero-meta">
            <span>{tracks.length} 个学段</span>
            <span className="dot-sep">·</span>
            <span>{owned.length} 个题库</span>
            <span className="dot-sep">·</span>
            <span>{count} 道题目</span>
          </div>
        </div>
      </header>

      {tracks.map((track) => {
        const inTrack = domain.id === 'imported'
          ? owned
          : owned.filter((collection) => collection.trackId === track.id)
        if (inTrack.length === 0) return null
        return (
          <section className="domain-track" key={track.id}>
            <div className="domain-track-head">
              <h2 className="serif">{track.name}</h2>
              <span>{track.description}</span>
              <span className="mono">{inTrack.length} 个题库</span>
            </div>
            <div className="collection-grid">
              {inTrack.map((collection) => (
                <Link
                  key={collection.id}
                  to={`/collection/${collection.id}`}
                  className="collection-card"
                  style={{ '--card-accent': domain.accent } as React.CSSProperties}
                >
                  <div className="collection-card-head">
                    <span className="collection-card-icon">
                      <DomainIcon name={collection.icon} />
                    </span>
                    <Badge tone="neutral">{collection.level}</Badge>
                    {collection.origin === 'builtin' ? (
                      <Badge tone="gold" outline>
                        示例
                      </Badge>
                    ) : null}
                  </div>
                  <h3>{collection.title}</h3>
                  <p>{collection.subtitle}</p>
                  <div className="collection-card-tags">
                    {collection.tags.slice(0, 3).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="collection-card-foot">
                    <span>
                      <Library /> {collection.questions.length} 题
                    </span>
                    <span>
                      <Clock /> {collection.durationMin} 分钟
                    </span>
                    <span className="collection-card-go">
                      <ChevronRight />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )
      })}

      <Link to="/catalog" className="back-link">
        返回题库总览
      </Link>
    </div>
  )
}
