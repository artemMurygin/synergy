import type { LucideIcon } from 'lucide-react'
import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const primaryButtonClass =
  'h-11 rounded-lg bg-brand-red px-5 text-[15px] font-semibold text-surface hover:bg-brand-red-hover disabled:opacity-60 [&_svg]:size-4'
export const ghostButtonClass =
  'h-11 rounded-lg px-4 text-[15px] font-semibold text-ink-60 hover:bg-surface-alt hover:text-ink'
export const outlineChipClass =
  'h-11 rounded-full border border-border-strong bg-surface px-[18px] text-sm font-medium text-ink hover:bg-surface-alt'

export type HeroTone = 'info' | 'danger' | 'muted'

const DISC_CLASS_BY_TONE: Record<HeroTone, string> = {
  info: 'bg-info-soft text-info',
  danger: 'bg-brand-red-soft text-brand-red',
  muted: 'bg-surface-sunken text-ink-60'
}

interface PanelHeroProps {
  icon: LucideIcon
  tone: HeroTone
  heading: string
  body: string
  isIconSpinning?: boolean
  children?: ReactNode
}

export function PanelHero({ icon: Icon, tone, heading, body, isIconSpinning = false, children }: PanelHeroProps) {
  return (
    <div className="flex gap-4">
      <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-full', DISC_CLASS_BY_TONE[tone])}>
        <Icon aria-hidden className={cn('size-[22px]', isIconSpinning && 'animate-spin')} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="font-display text-[17px] leading-[22px] font-bold text-ink">{heading}</h3>
        <p className="text-sm leading-5 text-ink-60">{body}</p>
        {children}
      </div>
    </div>
  )
}

interface PanelNoticeProps {
  title: string
  text: string
}

export function PanelNotice({ title, text }: PanelNoticeProps) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-md bg-brand-red-soft px-3.5 py-3">
      <CircleAlert aria-hidden className="mt-px size-[18px] shrink-0 text-brand-red" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[13px] leading-[15px] font-semibold text-ink">{title}</span>
        <span className="text-xs leading-[17px] text-ink-80">{text}</span>
      </div>
    </div>
  )
}

export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 px-6 pt-1 pb-2">{children}</div>
}

interface PanelFooterProps {
  children: ReactNode
  isSpread?: boolean
}

export function PanelFooter({ children, isSpread = false }: PanelFooterProps) {
  return (
    <div className={cn('flex items-center gap-3 px-6 pt-4 pb-6', isSpread ? 'justify-between' : 'justify-end')}>
      {children}
    </div>
  )
}
