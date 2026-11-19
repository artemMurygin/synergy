import type { ReactNode } from 'react'

export type RunNoticeTone = 'error' | 'neutral' | 'info'

type RunNoticeProps = {
  tone: RunNoticeTone
  icon?: ReactNode
  title: string
  text: string
  /** `status` for passive notices, `alert` for errors. */
  role: 'status' | 'alert'
  actionLabel?: string
  onAction?: () => void
}

const TONE: Record<RunNoticeTone, string> = {
  error: 'bg-brand-red-soft text-brand-red',
  neutral: 'bg-surface-alt text-ink-60',
  info: 'bg-info-soft text-info',
}

/** Notice of the chat feed (Run Notice / Message Notice): the icon takes the tone color. */
export function RunNotice({ tone, icon, title, text, role, actionLabel, onAction }: RunNoticeProps) {
  return (
    <div role={role} className={`flex w-full items-start gap-2.5 rounded-2xl py-2.5 pr-2.5 pl-3.5 ${TONE[tone]}`}>
      {icon !== undefined && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-chat text-sm font-semibold text-ink">{title}</span>
        <span className="font-chat text-[13px] leading-[1.4] text-ink-60">{text}</span>
      </div>
      {actionLabel !== undefined && onAction !== undefined && (
        <button
          type="button"
          onClick={onAction}
          className="flex h-8 shrink-0 items-center rounded-2xl bg-surface px-3 font-chat text-[13px] font-semibold text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
