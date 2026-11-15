import type { ReactNode } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

export function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  )
}

/** Page title block: h1 Onest 26/700 (32 from 768 px) with a caption under it. */
export function PageHeading({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h1 className="font-display text-[26px] font-bold leading-[1.28] tracking-[-0.4px] text-ink min-[768px]:text-[32px] min-[768px]:tracking-[-0.6px]">{title}</h1>
      <p className="text-sm leading-[1.4] text-ink-60">{caption}</p>
    </div>
  )
}

/** "Загружаем …" status with three skeleton rows, as in the queue. */
export function LoadingBlock({ text }: { text: string }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      <p className="text-sm text-ink-60">{text}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="h-16 animate-pulse rounded-lg bg-surface-alt" />
      ))}
    </div>
  )
}

/** Error alert with a retry button under it. */
export function ErrorBlock({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Alert title={title} className="w-full">
        {message}
      </Alert>
      <Button variant="outline" onClick={onRetry}>
        Повторить
      </Button>
    </div>
  )
}

/** Centered empty state: round icon, title, text and an action. */
export function EmptyBlock({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-pill bg-brand-red-soft text-brand-red">{icon}</span>
      <h2 className="font-display text-[26px] font-bold leading-tight text-ink">{title}</h2>
      <p className="max-w-[460px] text-sm text-ink-60">{text}</p>
      {action}
    </div>
  )
}
