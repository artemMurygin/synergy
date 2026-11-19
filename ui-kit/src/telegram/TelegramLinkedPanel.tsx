import { useId } from 'react'
import { Check, Unlink } from '../icons'
import { Button } from '../primitives/Button'
import { Switch } from '../primitives/Switch'
import { TelegramAlert, TelegramHeader } from './TelegramPanelParts'

export type TelegramLinkedPanelProps = {
  username: string
  /** Время привязки (ISO-строка или Date). */
  linkedAt: string | Date
  notificationsEnabled: boolean
  /** Запрос переключателя в полёте. */
  togglePending?: boolean
  /** Сервер не принял переключатель; значение вернулось в прежнее положение. */
  error?: string
  onToggleNotifications: (enabled: boolean) => void
  onUnlink: () => void
  onClose?: () => void
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function formatLinkedAt(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return dateFormat.format(date).replace(/\s*г\.?,?\s*(?:в\s)?/, ', ')
}

/** Подключённый Telegram: username, время привязки, переключатель уведомлений, отключение (макет G2zsX). */
export function TelegramLinkedPanel({
  username,
  linkedAt,
  notificationsEnabled,
  togglePending,
  error,
  onToggleNotifications,
  onUnlink,
  onClose,
}: TelegramLinkedPanelProps) {
  const switchId = useId()
  const hintId = useId()
  const initials = username.slice(0, 2).toUpperCase()
  const linkedText = formatLinkedAt(linkedAt)
  return (
    <section aria-label="Telegram" className="flex flex-col gap-5">
      <TelegramHeader subtitle="Подключён" onClose={onClose} />
      <div className="flex items-center gap-3 rounded-[16px] bg-surface-alt p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold text-ink-80">{initials}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-[15px] font-semibold text-ink">@{username}</p>
          {linkedText ? <p className="text-xs text-ink-60">Подключён {linkedText}</p> : null}
        </div>
        <span className="inline-flex items-center gap-1 rounded-xl bg-success-soft py-1 pr-2.5 pl-2 text-xs font-semibold text-success">
          <Check size={14} />
          Подключён
        </span>
      </div>
      <div className="flex items-center gap-4 px-1">
        <div className="flex flex-1 flex-col gap-0.5">
          <label htmlFor={switchId} className="text-sm font-semibold text-ink">
            Уведомления в Telegram
          </label>
          <p id={hintId} className="text-[13px] text-ink-60">
            Назначения и изменения задач приходят в чат с ботом.
          </p>
        </div>
        <Switch
          id={switchId}
          aria-describedby={hintId}
          checked={notificationsEnabled}
          disabled={togglePending}
          onCheckedChange={onToggleNotifications}
        />
      </div>
      {error ? <TelegramAlert title="Не удалось изменить настройку">{error}</TelegramAlert> : null}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onUnlink} className="h-11 rounded-[22px] px-3 text-sm font-semibold text-brand-red">
          <Unlink size={16} />
          Отключить Telegram
        </Button>
        {onClose ? (
          <Button variant="secondary" onClick={onClose} className="h-11 rounded-[22px] border-transparent bg-surface-alt px-[18px] text-sm">
            Готово
          </Button>
        ) : null}
      </div>
    </section>
  )
}
