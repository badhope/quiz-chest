import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Chip({
  children,
  active = false,
  onClick,
  ...rest
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      className={`chip${active ? ' active' : ''}`}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  )
}
