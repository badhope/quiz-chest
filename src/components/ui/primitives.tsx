import type { ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'moss' | 'gold' | 'danger' | 'success'

export function Badge({
  children,
  tone = 'neutral',
  outline = false,
}: {
  children: ReactNode
  tone?: Tone
  outline?: boolean
}) {
  return (
    <span className={`badge badge-${tone}${outline ? ' badge-outline' : ''}`}>
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
}) {
  return (
    <div className="stat">
      {icon ? <span className="stat-icon">{icon}</span> : null}
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {hint ? <span className="stat-hint">{hint}</span> : null}
      </div>
    </div>
  )
}

export function ProgressBar({
  value,
  tone = 'accent',
  label,
}: {
  value: number
  tone?: 'accent' | 'moss' | 'gold'
  label?: string
}) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      className={`progress progress-${tone}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? '进度'}
    >
      <span style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}
