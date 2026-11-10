import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuthSession } from '@/shared/auth'
import type { TelegramLinkStatus } from '@/shared/telegram-schema'
import { RunNotice } from '@/sidepanel/RunNotice'
import {
  AlertIcon,
  BotOffIcon,
  ExternalLinkIcon,
  RefreshIcon,
  RetryIcon,
  SendIcon,
  SpinnerIcon,
  TimerOffIcon,
  UnlinkIcon,
} from './icons'
import { InlineConfirm } from './InlineConfirm'
import { Switch } from './Switch'
import { useTelegramLink } from './use-telegram-link'
import type { TelegramLink, TelegramLinkState } from './use-telegram-link'

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60

const INTRO_TEXT =
  'Получайте уведомления о задачах в Telegram. Откроется вкладка с ботом — нажмите в нём «Start».'
const NOTIFICATIONS_ON_HINT = 'Назначения и изменения задач приходят в чат с ботом.'
const NOTIFICATIONS_OFF_HINT =
  'Сообщения в Telegram не приходят. Уведомления остаются в расширении.'
const TOGGLE_ERROR_TEXT =
  'Сервер не принял изменение, переключатель вернулся в прежнее положение. Повторите позже.'

type BadgeTone = 'linked' | 'unlinked'

const PRIMARY_BUTTON_CLASS =
  'flex h-11 items-center justify-center gap-2 self-start rounded-2xl bg-brand-red px-5 text-sm font-semibold text-white shadow-[0_6px_16px_#66000033] hover:bg-brand-red-hover disabled:cursor-default disabled:opacity-60 disabled:hover:bg-brand-red'

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / MS_PER_SECOND)
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`
}

function formatLinkedAt(linkedAt: string): string {
  const date = new Date(linkedAt)
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `Подключён ${day} ${String(date.getFullYear())}, ${time}`
}

function accountName(status: TelegramLinkStatus): string {
  return status.username === null ? 'Telegram-аккаунт' : `@${status.username}`
}

function badgeOf(state: TelegramLinkState): BadgeTone | null {
  switch (state.kind) {
    case 'linked':
    case 'unlinking':
      return 'linked'
    case 'idle':
    case 'issuing':
    case 'waiting':
    case 'expired':
    case 'error':
    case 'not-configured':
      return 'unlinked'
    default:
      return null
  }
}

function StatusBadge({ tone }: { tone: BadgeTone }) {
  const isLinked = tone === 'linked'
  return (
    <span
      className={`ml-auto flex shrink-0 items-center gap-1.75 rounded-full px-3 py-1.5 text-xs font-semibold ${
        isLinked ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-60'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.75 rounded-full ${isLinked ? 'bg-success' : 'bg-ink-40'}`}
      />
      {isLinked ? 'Подключён' : 'Не подключён'}
    </span>
  )
}

function IntroText() {
  return <p className="text-sm text-ink-80">{INTRO_TEXT}</p>
}

function LoadingBody() {
  return (
    <>
      <span className="sr-only">Загружаем статус Telegram…</span>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="h-3 w-full max-w-90 rounded-md bg-surface-sunken" />
        <div className="h-3 w-full max-w-60 rounded-md bg-surface-sunken" />
        <div className="h-11 w-37.5 rounded-2xl bg-surface-sunken" />
      </div>
    </>
  )
}

function WaitingBody({
  botUsername,
  remainingMs,
  onReopen,
  onCancel,
}: {
  botUsername: string | null
  remainingMs: number
  onReopen: () => void
  onCancel: () => void
}) {
  const botMention = botUsername === null ? 'с ботом' : `с ботом @${botUsername}`
  return (
    <>
      <div className="flex items-center gap-2">
        <SpinnerIcon className="text-info" />
        <span className="text-sm font-semibold text-ink">Ждём подтверждения в Telegram</span>
      </div>
      <p className="text-sm text-ink-60">
        Во вкладке {botMention} нажмите «Start». Раздел обновится сам — страницу можно не
        перезагружать.
      </p>
      <span
        role="timer"
        className="flex items-center gap-1.75 self-start rounded-full bg-info-soft px-3 py-1.5 text-xs font-semibold text-info"
      >
        <span aria-hidden="true" className="size-1.75 rounded-full bg-info" />
        Ссылка действует ещё {formatCountdown(remainingMs)}
      </span>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
        <button
          type="button"
          className="flex h-10 items-center justify-center gap-2 rounded-full border border-field-line bg-white px-4 text-sm font-medium text-ink hover:bg-surface-alt"
          onClick={onReopen}
        >
          Открыть ссылку ещё раз
          <ExternalLinkIcon className="text-ink-60" />
        </button>
        <button
          type="button"
          className="text-sm font-semibold text-ink-60 hover:text-ink"
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
    </>
  )
}

function LinkedBody({
  status,
  isToggling,
  isUnlinking,
  toggleError,
  unlinkError,
  onToggle,
  onUnlink,
}: {
  status: TelegramLinkStatus
  isToggling: boolean
  isUnlinking: boolean
  toggleError: string | null
  unlinkError: string | null
  onToggle: (isEnabled: boolean) => void
  onUnlink: () => void
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const hintId = useId()
  const isConfirming = isConfirmOpen || isUnlinking
  const name = accountName(status)
  return (
    <>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="break-words text-[15px] font-semibold text-ink">{name}</span>
        {status.linkedAt !== null && (
          <span className="text-xs text-ink-60">{formatLinkedAt(status.linkedAt)}</span>
        )}
      </div>
      <div className="h-px w-full bg-line" />
      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-ink">Уведомления в Telegram</span>
          <span id={hintId} className="text-xs text-ink-60">
            {status.notificationsEnabled ? NOTIFICATIONS_ON_HINT : NOTIFICATIONS_OFF_HINT}
          </span>
        </div>
        <Switch
          isChecked={status.notificationsEnabled}
          isDisabled={isToggling || isConfirming}
          label="Уведомления в Telegram"
          descriptionId={hintId}
          onChange={onToggle}
        />
      </div>
      {toggleError !== null && (
        <RunNotice
          tone="error"
          role="alert"
          icon={<AlertIcon />}
          title="Не удалось изменить настройку"
          text={TOGGLE_ERROR_TEXT}
        />
      )}
      {unlinkError !== null && (
        <RunNotice
          tone="error"
          role="alert"
          icon={<AlertIcon />}
          title="Не удалось отключить Telegram"
          text={unlinkError}
        />
      )}
      {isConfirming ? (
        <InlineConfirm
          message={`Отключить Telegram ${name}? Уведомления перестанут приходить в этот чат.`}
          confirmLabel="Отключить"
          pendingLabel="Отключаем…"
          isPending={isUnlinking}
          onConfirm={onUnlink}
          onCancel={() => {
            setIsConfirmOpen(false)
          }}
        />
      ) : (
        <>
          <div className="h-px w-full bg-line" />
          <button
            type="button"
            className="flex items-center gap-1.5 self-start text-sm font-semibold text-brand-red hover:text-brand-red-hover"
            onClick={() => {
              setIsConfirmOpen(true)
            }}
          >
            <UnlinkIcon />
            Отключить Telegram
          </button>
        </>
      )}
    </>
  )
}

function SectionBody({ link }: { link: TelegramLink }) {
  const { state } = link
  const connect = () => void link.connect()
  switch (state.kind) {
    case 'loading':
    case 'unavailable':
      return <LoadingBody />
    case 'signed-out':
      return (
        <p className="text-sm text-ink-60">
          Чтобы подключить Telegram, войдите в боковой панели расширения.
        </p>
      )
    case 'load-error':
      return (
        <>
          <RunNotice
            tone="error"
            role="alert"
            icon={<AlertIcon />}
            title="Не удалось загрузить статус Telegram"
            text={state.message}
          />
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={link.reload}>
            <RetryIcon />
            Повторить
          </button>
        </>
      )
    case 'idle':
      return (
        <>
          <IntroText />
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={connect}>
            <SendIcon size={16} />
            Подключить
          </button>
        </>
      )
    case 'issuing':
      return (
        <>
          <IntroText />
          <button type="button" disabled className={PRIMARY_BUTTON_CLASS}>
            <SpinnerIcon />
            Получаем ссылку…
          </button>
        </>
      )
    case 'waiting':
      return (
        <WaitingBody
          botUsername={state.botUsername}
          remainingMs={link.remainingMs}
          onReopen={link.reopenLink}
          onCancel={link.cancel}
        />
      )
    case 'expired':
      return (
        <>
          <RunNotice
            tone="error"
            role="status"
            icon={<TimerOffIcon />}
            title="Ссылка устарела"
            text="Ссылка действует 10 минут. Получите новую — она откроется в новой вкладке."
          />
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={connect}>
            <RefreshIcon />
            Получить новую
          </button>
        </>
      )
    case 'error':
      return (
        <>
          <IntroText />
          <RunNotice
            tone="error"
            role="alert"
            icon={<AlertIcon />}
            title="Не удалось получить ссылку"
            text={state.message}
          />
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={connect}>
            <RetryIcon />
            Повторить
          </button>
        </>
      )
    case 'not-configured':
      return (
        <RunNotice
          tone="error"
          role="status"
          icon={<BotOffIcon />}
          title="Telegram-бот не настроен"
          text="На сервере не задан бот, подключение недоступно. Обратитесь к администратору."
        />
      )
    case 'linked':
      return (
        <LinkedBody
          status={state.status}
          isToggling={state.isToggling}
          isUnlinking={false}
          toggleError={state.toggleError}
          unlinkError={state.unlinkError}
          onToggle={(isEnabled) => void link.toggleNotifications(isEnabled)}
          onUnlink={() => void link.unlink()}
        />
      )
    case 'unlinking':
      return (
        <LinkedBody
          status={state.status}
          isToggling={false}
          isUnlinking
          toggleError={null}
          unlinkError={null}
          onToggle={(isEnabled) => void link.toggleNotifications(isEnabled)}
          onUnlink={() => void link.unlink()}
        />
      )
  }
}

function SectionFrame({
  badge,
  isBusy,
  children,
}: {
  badge: BadgeTone | null
  isBusy: boolean
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={isBusy}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5"
    >
      <div className="flex items-center gap-2.5">
        <SendIcon className="shrink-0 text-info" />
        <h2 id={headingId} className="text-base font-semibold text-ink">
          Telegram
        </h2>
        {badge !== null && <StatusBadge tone={badge} />}
      </div>
      {children}
    </section>
  )
}

export function TelegramSection() {
  const session = useAuthSession()
  const link = useTelegramLink(session.status)
  if (link.state.kind === 'unavailable') return null
  return (
    <SectionFrame badge={badgeOf(link.state)} isBusy={link.state.kind === 'loading'}>
      <SectionBody link={link} />
    </SectionFrame>
  )
}
