import { BotOff, ExternalLink, LoaderCircle, RefreshCw, RotateCcw, Send, TimerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCountdown } from './telegram-format'
import {
  ghostButtonClass,
  outlineChipClass,
  PanelBody,
  PanelFooter,
  PanelHero,
  PanelNotice,
  primaryButtonClass
} from './telegram-panel-parts'

export type TelegramConnectPanelState =
  | 'loading'
  | 'idle'
  | 'issuing'
  | 'waiting'
  | 'expired'
  | 'error'
  | 'not-configured'

interface TelegramConnectPanelProps {
  state: TelegramConnectPanelState
  botUsername: string | null
  remainingMs: number
  errorMessage: string | null
  onConnect: () => void
  onReopenLink: () => void
  onCancel: () => void
  onClose: () => void
}

const CONNECT_HEADING = 'Подключите Telegram'
const CONNECT_BODY = 'Уведомления о задачах будут приходить в чат с ботом. Откроется Telegram — там нажмите «Start».'
const FALLBACK_ERROR_TEXT = 'Нет связи с сервером. Проверьте подключение и повторите.'

const waitingBody = (botUsername: string | null): string =>
  `Откройте чат с ${botUsername ? `@${botUsername}` : 'ботом'} и нажмите «Start». Окно обновится само, как только Telegram будет подключён.`

function CancelButton({ onCancel }: { onCancel: () => void }) {
  return (
    <Button type="button" variant="ghost" className={ghostButtonClass} onClick={onCancel}>
      Отмена
    </Button>
  )
}

export function TelegramConnectPanel({
  state,
  botUsername,
  remainingMs,
  errorMessage,
  onConnect,
  onReopenLink,
  onCancel,
  onClose
}: TelegramConnectPanelProps) {
  if (state === 'waiting') {
    return (
      <>
        <PanelBody>
          <PanelHero icon={LoaderCircle} tone="info" heading="Ждём подтверждения в Telegram" body={waitingBody(botUsername)} isIconSpinning>
            <span className="inline-flex items-center gap-[7px] self-start rounded-full bg-info-soft px-3 py-1.5 text-xs leading-[14px] font-semibold text-info">
              <span aria-hidden className="size-[7px] rounded-full bg-info" />
              {`Ссылка действует ещё ${formatCountdown(remainingMs)}`}
            </span>
          </PanelHero>
        </PanelBody>
        <PanelFooter>
          <CancelButton onCancel={onCancel} />
          <Button type="button" variant="ghost" className={outlineChipClass} onClick={onReopenLink}>
            Открыть ссылку ещё раз
            <ExternalLink aria-hidden className="size-4 text-ink-60" />
          </Button>
        </PanelFooter>
      </>
    )
  }

  if (state === 'expired') {
    return (
      <>
        <PanelBody>
          <PanelHero
            icon={TimerOff}
            tone="danger"
            heading="Ссылка устарела"
            body="Ссылка действует 10 минут и больше не сработает. Получите новую — она снова откроется в Telegram."
          />
        </PanelBody>
        <PanelFooter>
          <CancelButton onCancel={onCancel} />
          <Button type="button" className={primaryButtonClass} onClick={onConnect}>
            <RefreshCw aria-hidden />
            Получить новую
          </Button>
        </PanelFooter>
      </>
    )
  }

  if (state === 'not-configured') {
    return (
      <>
        <PanelBody>
          <PanelHero
            icon={BotOff}
            tone="muted"
            heading="Telegram-бот не настроен"
            body="На сервере не задан бот, поэтому подключить Telegram сейчас нельзя. Обратитесь к администратору."
          />
        </PanelBody>
        <PanelFooter>
          <Button type="button" variant="ghost" className={outlineChipClass} onClick={onClose}>
            Закрыть
          </Button>
        </PanelFooter>
      </>
    )
  }

  if (state === 'error') {
    return (
      <>
        <PanelBody>
          <PanelHero icon={Send} tone="info" heading={CONNECT_HEADING} body={CONNECT_BODY} />
          <PanelNotice title="Не удалось получить ссылку" text={errorMessage ?? FALLBACK_ERROR_TEXT} />
        </PanelBody>
        <PanelFooter>
          <Button type="button" className={`${primaryButtonClass} w-full`} onClick={onConnect}>
            <RotateCcw aria-hidden />
            Повторить
          </Button>
        </PanelFooter>
      </>
    )
  }

  const isIssuing = state === 'issuing'
  return (
    <>
      <PanelBody>
        <PanelHero icon={Send} tone="info" heading={CONNECT_HEADING} body={CONNECT_BODY} />
      </PanelBody>
      <PanelFooter>
        <Button
          type="button"
          className={`${primaryButtonClass} w-full`}
          disabled={isIssuing || state === 'loading'}
          aria-busy={isIssuing}
          onClick={onConnect}
        >
          {isIssuing ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
          {isIssuing ? 'Получаем ссылку…' : 'Подключить'}
        </Button>
      </PanelFooter>
    </>
  )
}
