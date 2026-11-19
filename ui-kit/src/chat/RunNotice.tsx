import type { ReactNode } from 'react'
import { CircleAlert, CircleStop, Info, RotateCcw } from '../icons'

export type RunNoticeTone = 'error' | 'neutral' | 'info'

type ToneNoticeProps = {
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

export type RunNoticeKind = 'error' | 'stopped' | 'conflict'

type KindNoticeProps = {
  kind: RunNoticeKind
  /** `error`: the reason; `conflict` and `stopped` have their own text. */
  text?: string
  /** `error`: heading, "Не удалось получить ответ" by default. */
  title?: string
  onRetry?: () => void
}

export const CONFLICT_TEXT = 'Агент ещё отвечает — дождитесь ответа или остановите его'
export const STOPPED_NOTE = 'Часть ответа не сохранена'

export type RunNoticeProps = ToneNoticeProps | KindNoticeProps

/** Notice of the chat feed by kind: an error with a retry, a stopped answer, a conflict with a run in progress. */
export function RunNotice(props: RunNoticeProps) {
  if (!('kind' in props)) return <ToneNotice {...props} />
  const { kind, text, title, onRetry } = props
  if (kind === 'stopped') {
    return (
      <div role="status" className="flex flex-wrap items-center gap-1 self-start px-1">
        <span className="flex items-center gap-1.5 p-1 font-chat text-xs font-medium text-ink-60">
          <span className="text-ink-40">
            <CircleStop size={14} />
          </span>
          Ответ остановлен
        </span>
        <span className="font-chat text-xs text-ink-40">{STOPPED_NOTE}</span>
        {onRetry !== undefined && (
          <button
            type="button"
            onClick={onRetry}
            className="flex h-[23px] items-center gap-1 rounded-sm px-2 font-chat text-xs font-medium text-ink-60 outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <RotateCcw size={14} />
            Повторить
          </button>
        )}
      </div>
    )
  }
  if (kind === 'conflict') {
    return (
      <ToneNotice
        tone="info"
        role="status"
        icon={<Info size={18} />}
        title={CONFLICT_TEXT}
        text=""
      />
    )
  }
  return (
    <ToneNotice
      tone="error"
      role="alert"
      icon={<CircleAlert size={18} />}
      title={title ?? 'Не удалось получить ответ'}
      text={text ?? ''}
      actionLabel={onRetry === undefined ? undefined : 'Повторить'}
      onAction={onRetry}
    />
  )
}

/** Notice of the chat feed (Run Notice / Message Notice): the icon takes the tone color. */
function ToneNotice({ tone, icon, title, text, role, actionLabel, onAction }: ToneNoticeProps) {
  return (
    <div role={role} className={`flex w-full items-start gap-2.5 rounded-2xl py-2.5 pr-2.5 pl-3.5 ${TONE[tone]}`}>
      {icon !== undefined && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-chat text-sm font-semibold text-ink">{title}</span>
        {text !== '' && <span className="font-chat text-[13px] leading-[1.4] text-ink-60">{text}</span>}
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
