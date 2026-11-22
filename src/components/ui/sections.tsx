import type { ReactNode } from 'react'

/**
 * 页头与区块头的唯一实现。
 *
 * 两个组件原本在每个页面各抄一遍 `eyebrow + h1 + page-sub`，18 个页头、
 * 14 个区块头，改一次字号要动十几个文件。这里只保留语义参数，
 * 布局交给 `page-head` / `section-head` 两个类。
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className={`page-head${actions ? ' page-head-row' : ''}`}>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="page-title serif">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-head-actions">{actions}</div> : null}
    </header>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  aside,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2 className="section-title serif">{title}</h2>
      </div>
      {aside}
    </div>
  )
}
