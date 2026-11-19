import { Clock, Loader, Send, TriangleAlert } from '../icons'
import { Button } from '../primitives/Button'
import { TelegramAlert, TelegramHeader } from './TelegramPanelParts'

export type TelegramConnectStatus = 'idle' | 'requesting' | 'waiting' | 'expired'

export type TelegramConnectPanelProps = {
  status: TelegramConnectStatus
  botName: string
  /** Ссылка на бота; открывается только через `onOpenLink`. */
  link?: string
  /** Сколько секунд ещё действует ссылка (ожидание подтверждения). */
  secondsLeft?: number
  /** Текст ошибки получения ссылки (только `idle`). */
  error?: string
  onConnect: () => void
  onOpenLink: (link: string) => void
  onCancel: () => void
  onRenew: () => void
  onClose?: () => void
}

export function formatTimeLeft(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(safe / 60))}:${String(safe % 60).padStart(2, '0')}`
}

const STEPS = [
  'Нажмите «Подключить» — откроется Telegram',
  'В чате с ботом нажмите «Start»',
  'Вернитесь сюда — окно обновится само',
]

/** Подключение Telegram: не подключён, получаем ссылку, ожидание подтверждения, ссылка устарела (макеты JLayI, b8m3B, nCcY1). */
export function TelegramConnectPanel({
  status,
  botName,
  link,
  secondsLeft,
  error,
  onConnect,
  onOpenLink,
  onCancel,
  onRenew,
  onClose,
}: TelegramConnectPanelProps) {
  if (status === 'waiting') {
    return (
      <section aria-label="Подключение Telegram" className="flex flex-col gap-5">
        <TelegramHeader subtitle="Ожидание подтверждения" onClose={onClose} />
        <div className="inline-flex items-center gap-2 self-start rounded-[18px] bg-info-soft px-3.5 py-2 text-[13px] font-semibold text-ink">
          <Loader size={16} className="animate-spin text-info" />
          Ждём подтверждения в Telegram
        </div>
        <p className="text-sm text-ink-60">
          Откройте чат с @{botName} и нажмите «Start». Окно обновится само, как только Telegram будет подключён.
        </p>
        {secondsLeft !== undefined ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-60">
            <Clock size={14} />
            Ссылка действует ещё {formatTimeLeft(secondsLeft)}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onCancel} className="h-11 rounded-[22px] px-[18px] text-sm">
            Отмена
          </Button>
          <Button
            disabled={!link}
            onClick={() => {
              if (link) onOpenLink(link)
            }}
            className="h-11 flex-1 rounded-[22px] px-[18px] text-sm shadow-none"
          >
            <Send size={16} />
            Открыть ссылку ещё раз
          </Button>
        </div>
      </section>
    )
  }

  if (status === 'expired') {
    return (
      <section aria-label="Подключение Telegram" className="flex flex-col gap-5">
        <TelegramHeader subtitle="Не подключён" onClose={onClose} />
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-base font-semibold text-ink">
            <TriangleAlert className="text-warning" />
            Ссылка устарела
          </p>
          <p className="text-sm text-ink-60">
            Ссылка действует 10 минут и больше не сработает. Получите новую — она снова откроется в Telegram.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onCancel} className="h-11 rounded-[22px] px-[18px] text-sm">
            Отмена
          </Button>
          <Button onClick={onRenew} className="h-11 flex-1 rounded-[22px] px-[18px] text-sm shadow-none">
            Получить новую
          </Button>
        </div>
      </section>
    )
  }

  const requesting = status === 'requesting'
  return (
    <section aria-label="Подключение Telegram" className="flex flex-col gap-5">
      <TelegramHeader subtitle="Не подключён" onClose={onClose} />
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-ink">Подключите Telegram</h3>
        <p className="text-sm text-ink-60">
          Уведомления о задачах будут приходить в чат с ботом @{botName}. Откроется Telegram — там нажмите «Start».
        </p>
      </div>
      <ol className="flex flex-col gap-2.5">
        {STEPS.map((text, i) => (
          <li key={text} className="flex items-center gap-2.5 text-[13px] text-ink-80">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-alt text-xs font-bold">{i + 1}</span>
            {text}
          </li>
        ))}
      </ol>
      {error ? <TelegramAlert title="Не удалось получить ссылку">{error}</TelegramAlert> : null}
      <Button disabled={requesting} onClick={onConnect} className="h-11 w-full rounded-[22px] px-[18px] text-sm shadow-none">
        {requesting ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
        {requesting ? 'Получаем ссылку…' : 'Подключить'}
      </Button>
    </section>
  )
}
