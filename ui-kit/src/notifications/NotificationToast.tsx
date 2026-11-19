import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, X } from '../icons'
import { cn } from '../lib/cn'
import { bellIconFallback } from './fallback-icon'
import { toneClasses, type NotificationTone } from './tones'

export type NotificationToastProps = {
  title: string
  text: string
  tone?: NotificationTone
  icon?: ReactNode
  actionLabel?: string
  onAction?: () => void
  onClose?: () => void
  /** Автоскрытие, мс (макет DNt8I: 6 секунд). Наведение ставит таймер на паузу. */
  duration?: number
  className?: string
}

/** Всплывающее уведомление о новом событии (макет fpEyH). */
export function NotificationToast({
  title,
  text,
  tone = 'brand',
  icon,
  actionLabel,
  onAction,
  onClose,
  duration = 6000,
  className,
}: NotificationToastProps) {
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)
  const remaining = useRef(duration)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!visible || paused) return undefined
    const startedAt = Date.now()
    const timer = setTimeout(() => {
      setVisible(false)
      onCloseRef.current?.()
    }, remaining.current)
    return () => {
      clearTimeout(timer)
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt))
    }
  }, [visible, paused])

  if (!visible) return null

  const close = () => {
    setVisible(false)
    onClose?.()
  }

  return (
    <div
      role="status"
      onMouseEnter={() => {
        setPaused(true)
      }}
      onMouseLeave={() => {
        setPaused(false)
      }}
      className={cn('flex w-full max-w-[380px] items-start gap-3 rounded-xl bg-surface py-3.5 pr-3 pl-3.5 shadow-panel', className)}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', toneClasses[tone])}>
        {icon ?? bellIconFallback}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="line-clamp-3 text-[13px] text-ink-80">{text}</p>
        {actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-1 inline-flex items-center gap-1 self-start text-[13px] font-bold text-brand-red outline-none focus-visible:underline"
          >
            {actionLabel}
            <ChevronRight size={14} />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Закрыть"
        onClick={close}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-60 outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40"
      >
        <X size={14} />
      </button>
    </div>
  )
}
