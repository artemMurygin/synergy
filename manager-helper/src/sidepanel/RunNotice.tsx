import type { ReactNode } from 'react'

export type RunNoticeTone = 'error' | 'neutral' | 'info'

interface Props {
  tone: RunNoticeTone
  icon: ReactNode
  title: string
  text: string
  /** `status` for passive notices, `alert` for errors. */
  role: 'status' | 'alert'
  actionLabel?: string
  onAction?: () => void
}

const TONE_CLASS: Record<RunNoticeTone, string> = {
  error: 'bg-brand-red-soft text-brand-red',
  neutral: 'bg-surface-alt text-ink-60',
  info: 'bg-[#e3ebfb] text-[#2563d9]',
}

/** Shared notice of the chat feed (Run Notice / Master in the UI kit). */
export function RunNotice({ tone, icon, title, text, role, actionLabel, onAction }: Props) {
  return (
    <div role={role} className={`flex w-full gap-2.5 rounded-xl px-3.5 py-3 ${TONE_CLASS[tone]}`}>
      <span className="mt-px shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <span className="text-xs leading-[1.4] text-[#3a3a3a]">{text}</span>
        {actionLabel && onAction && (
          <button
            type="button"
            className="self-start text-[13px] font-semibold text-brand-red hover:text-brand-red-hover"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
