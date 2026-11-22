import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from './icons'
import { EmptyState } from './primitives'

/**
 * 详情页找不到实体时的统一状态。
 *
 * 以前题库、领域、目标、练习结果各自手写一份“可能已被调整 + 返回链接”，
 * 文案和按钮层级容易漂移；这里只保留每个页面真正不同的图标、标题与返回目标。
 */
export function MissingPage({
  icon,
  title,
  description,
  to,
  linkLabel,
  className,
}: {
  icon: ReactNode
  title: string
  description: string
  to: string
  linkLabel: string
  className?: string
}) {
  const content = (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={
        <Link to={to} className="button button-primary button-sm">
          <ArrowLeft /> {linkLabel}
        </Link>
      }
    />
  )
  return className ? <div className={className}>{content}</div> : content
}
