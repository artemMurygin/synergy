import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn'

export type PanelHeaderProps = {
  title: string
  meta?: string
  leading?: ReactNode
  actions?: ReactNode
  className?: string
}

/** Шапка панели: капсула с заголовком и капсула с действиями (макет Chat Header). */
export function PanelHeader({ title, meta, leading, actions, className }: PanelHeaderProps) {
  return (
    <header className={cn('flex h-16 shrink-0 items-center gap-2 px-3', className)}>
      {leading}
      <div className="flex h-11 min-w-0 items-center gap-2.5 rounded-[22px] bg-surface-alt px-4">
        <h2 className="truncate text-lg font-semibold text-ink">{title}</h2>
        {meta ? <span className="shrink-0 text-[13px] text-ink-60">{meta}</span> : null}
      </div>
      <div className="flex-1" />
      {actions ? <div className="flex h-11 items-center rounded-[22px] bg-surface-alt px-1">{actions}</div> : null}
    </header>
  )
}

export type PanelHeaderButtonProps = Omit<ComponentProps<'button'>, 'aria-label' | 'children'> & {
  label: string
  icon: ReactNode
  tone?: 'default' | 'primary'
}

/** Круглая кнопка шапки (36 px). */
export function PanelHeaderButton({ label, icon, tone = 'default', className, type = 'button', ...props }: PanelHeaderButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40',
        tone === 'primary' ? 'bg-brand-red text-white hover:bg-brand-red-hover' : 'text-ink-80 hover:bg-border',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  )
}
