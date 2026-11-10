import { Send, Unlink } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { TelegramLinkStatus } from '@/lib/backend/telegram.schema'
import { formatLinkedAt, formatTelegramUsername } from './telegram-format'
import { outlineChipClass, PanelBody, PanelFooter, PanelNotice } from './telegram-panel-parts'
import { TelegramUnlinkDialog } from './TelegramUnlinkDialog'

interface TelegramLinkedPanelProps {
  status: TelegramLinkStatus
  isUnlinking: boolean
  toggleErrorMessage: string | null
  unlinkErrorMessage: string | null
  onToggleNotifications: (isEnabled: boolean) => void
  onUnlink: () => void
  onDone: () => void
}

const NOTIFICATIONS_ON_HINT = 'Назначения и изменения задач приходят в чат с ботом.'
const NOTIFICATIONS_OFF_HINT = 'Сообщения в Telegram не приходят. Уведомления остаются в приложении.'
const TOGGLE_ERROR_TEXT = 'Сервер не принял изменение, переключатель вернулся в прежнее положение. Повторите позже.'

export function TelegramLinkedPanel({
  status,
  isUnlinking,
  toggleErrorMessage,
  unlinkErrorMessage,
  onToggleNotifications,
  onUnlink,
  onDone
}: TelegramLinkedPanelProps) {
  const [isConfirmOpen, setConfirmOpen] = useState(false)
  const switchLabelId = useId()
  const switchHintId = useId()
  const username = formatTelegramUsername(status.username)
  const isNotificationsEnabled = status.notificationsEnabled ?? false

  useEffect(() => {
    if (!isUnlinking && unlinkErrorMessage !== null) setConfirmOpen(false)
  }, [isUnlinking, unlinkErrorMessage])

  return (
    <>
      <PanelBody>
        <div className="flex items-center gap-3 rounded-md bg-surface-alt p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
            <Send aria-hidden className="size-[18px]" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="truncate text-[15px] leading-[18px] font-semibold text-ink">{username ?? 'Telegram'}</span>
            {status.linkedAt && (
              <span className="text-xs leading-[14px] text-ink-60">{`Подключён ${formatLinkedAt(status.linkedAt)}`}</span>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-[7px] rounded-full bg-success-soft px-3 py-1.5 text-xs leading-[14px] font-semibold text-success">
            <span aria-hidden className="size-[7px] rounded-full bg-success" />
            Подключён
          </span>
        </div>
        <div className="flex items-center gap-4 py-1">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span id={switchLabelId} className="text-sm leading-4 font-semibold text-ink">
              Уведомления в Telegram
            </span>
            <span id={switchHintId} className="text-xs leading-[17px] text-ink-60">
              {isNotificationsEnabled ? NOTIFICATIONS_ON_HINT : NOTIFICATIONS_OFF_HINT}
            </span>
          </div>
          <Switch
            aria-labelledby={switchLabelId}
            aria-describedby={switchHintId}
            checked={isNotificationsEnabled}
            disabled={isUnlinking}
            onCheckedChange={onToggleNotifications}
          />
        </div>
        {toggleErrorMessage !== null && <PanelNotice title="Не удалось изменить настройку" text={TOGGLE_ERROR_TEXT} />}
        {unlinkErrorMessage !== null && !isUnlinking && (
          <PanelNotice title="Не удалось отключить Telegram" text={unlinkErrorMessage} />
        )}
      </PanelBody>
      <PanelFooter isSpread>
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-lg px-3 text-sm font-semibold text-brand-red hover:bg-brand-red-soft hover:text-brand-red"
          disabled={isUnlinking}
          onClick={() => setConfirmOpen(true)}
        >
          <Unlink aria-hidden className="size-4" />
          Отключить Telegram
        </Button>
        <Button type="button" variant="ghost" className={outlineChipClass} onClick={onDone}>
          Готово
        </Button>
      </PanelFooter>
      <TelegramUnlinkDialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!isUnlinking) setConfirmOpen(open)
        }}
        username={username}
        isPending={isUnlinking}
        onConfirm={onUnlink}
      />
    </>
  )
}
