import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type RunNoticeTone = 'error' | 'neutral' | 'info'

interface RunNoticeProps {
  tone: RunNoticeTone
  icon: ReactNode
  title: string
  text: string
  /** `status` for passive notices, `alert` for errors. */
  role: 'status' | 'alert'
  actionLabel?: string
  onAction?: () => void
}

// The UI kit draws every notice on the soft brand red; tones differ by icon only
const SOFT = 'bg-brand-red-soft text-primary dark:bg-destructive/10 dark:text-destructive'
const toneClass: Record<RunNoticeTone, string> = {
  error: SOFT,
  neutral: SOFT,
  info: SOFT
}

/** Notice of the chat feed (Run Notice / Master in the UI kit). */
export function RunNotice({ tone, icon, title, text, role, actionLabel, onAction }: RunNoticeProps) {
  return (
    <div role={role} className={cn('flex w-full gap-2.5 rounded-xl px-3.5 py-3', toneClass[tone])}>
      <span className="mt-px shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
        <span className="text-xs leading-[1.4] text-foreground/80">{text}</span>
        {actionLabel && onAction && (
          <button
            type="button"
            className="self-start text-[13px] font-semibold text-primary hover:underline"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
