import { Send } from '../icons'
import { Button } from '../primitives/Button'

/** Бот не настроен на сервере: подключить Telegram нельзя. */
export function TelegramNotConfiguredPanel({ onClose }: { onClose?: () => void }) {
  return (
    <section aria-label="Telegram" className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-60">
          <Send />
        </span>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base font-semibold text-ink">Telegram-бот не настроен</h3>
          <p className="text-sm text-ink-60">
            На сервере не задан бот, поэтому подключить Telegram сейчас нельзя. Обратитесь к администратору.
          </p>
        </div>
      </div>
      {onClose ? (
        <Button variant="secondary" onClick={onClose} className="self-end">
          Закрыть
        </Button>
      ) : null}
    </section>
  )
}
