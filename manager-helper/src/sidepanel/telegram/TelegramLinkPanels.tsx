import {
  Button,
  TelegramConnectPanel,
  TelegramLinkedPanel,
  TelegramUnlinkConfirm,
} from '@synergy/ui-kit'
import { BotOff } from '@synergy/ui-kit/icons'
import { useState } from 'react'
import type { TelegramLink } from '@/options/telegram/use-telegram-link'

const BOT_NOT_CONFIGURED_TEXT =
  'На сервере не задан бот, подключение недоступно. Обратитесь к администратору.'

/** Telegram link states of `use-telegram-link` drawn with the package panels (pane and settings page). */
export function TelegramLinkPanels({ link }: { link: TelegramLink }) {
  const { state } = link
  const [confirming, setConfirming] = useState(false)

  switch (state.kind) {
    case 'loading':
    case 'unavailable':
      return (
        <p role="status" className="text-sm text-ink-60">
          Загружаем статус Telegram…
        </p>
      )
    case 'signed-out':
      return (
        <p className="text-sm text-ink-60">
          Чтобы подключить Telegram, войдите в боковой панели расширения.
        </p>
      )
    case 'load-error':
      return (
        <div className="flex flex-col gap-3">
          <div role="alert" className="rounded-lg bg-brand-red-soft px-3.5 py-3">
            <p className="text-sm font-semibold text-ink">Не удалось загрузить статус Telegram</p>
            <p className="text-[13px] text-ink-80">{state.message}</p>
          </div>
          <Button onClick={link.reload} className="h-11 w-full rounded-[22px] px-[18px] text-sm">
            Повторить
          </Button>
        </div>
      )
    case 'not-configured':
      return (
        <div role="status" className="flex items-start gap-2.5 text-sm text-ink-60">
          <BotOff className="mt-px shrink-0" />
          <div>
            <p className="font-semibold text-ink">Telegram-бот не настроен</p>
            <p>{BOT_NOT_CONFIGURED_TEXT}</p>
          </div>
        </div>
      )
    case 'idle':
    case 'error':
    case 'issuing':
    case 'waiting':
    case 'expired':
      return (
        <TelegramConnectPanel
          status={
            state.kind === 'issuing'
              ? 'requesting'
              : state.kind === 'waiting' || state.kind === 'expired'
                ? state.kind
                : 'idle'
          }
          botName={state.kind === 'waiting' ? (state.botUsername ?? undefined) : undefined}
          link={state.kind === 'waiting' ? state.url : undefined}
          secondsLeft={state.kind === 'waiting' ? Math.ceil(link.remainingMs / 1000) : undefined}
          error={state.kind === 'error' ? state.message : undefined}
          onConnect={() => void link.connect()}
          onOpenLink={link.reopenLink}
          onCancel={link.cancel}
          onRenew={() => void link.connect()}
        />
      )
    case 'linked':
    case 'unlinking': {
      const { status } = state
      const username = status.username ?? 'telegram'
      if (confirming || state.kind === 'unlinking') {
        return (
          <TelegramUnlinkConfirm
            username={username}
            pending={state.kind === 'unlinking'}
            onConfirm={() => {
              void link.unlink().finally(() => {
                setConfirming(false)
              })
            }}
            onCancel={() => {
              setConfirming(false)
            }}
          />
        )
      }
      return (
        <TelegramLinkedPanel
          username={username}
          linkedAt={status.linkedAt ?? ''}
          notificationsEnabled={status.notificationsEnabled}
          togglePending={state.isToggling}
          error={state.toggleError ?? state.unlinkError ?? undefined}
          onToggleNotifications={(enabled) => void link.toggleNotifications(enabled)}
          onUnlink={() => {
            setConfirming(true)
          }}
        />
      )
    }
  }
}
