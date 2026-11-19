import {
  Button,
  Dialog,
  DialogContent,
  TelegramConnectPanel,
  TelegramLinkedPanel,
  TelegramUnlinkConfirm,
  type TelegramConnectStatus
} from '@synergy/ui-kit'
import { Send } from '@synergy/ui-kit/icons'
import { useState } from 'react'
import { useTelegramLinkFlow, type TelegramLinkFlowState } from './use-telegram-link-flow'

interface TelegramDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const FALLBACK_ERROR_TEXT = 'Нет связи с сервером. Проверьте подключение и повторите.'

const toConnectStatus = (state: TelegramLinkFlowState): TelegramConnectStatus => {
  if (state === 'issuing' || state === 'loading') return 'requesting'
  if (state === 'waiting' || state === 'expired') return state
  return 'idle'
}

function NotConfigured({ onClose }: { onClose: () => void }) {
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
      <Button variant="secondary" onClick={onClose} className="self-end">
        Закрыть
      </Button>
    </section>
  )
}

// Telegram link dialog (frames JLayI, G2zsX): the flow hook owns the state, the package panels draw it
export function TelegramDialog({ open, onOpenChange }: TelegramDialogProps) {
  const flow = useTelegramLinkFlow()
  const [isConfirming, setConfirming] = useState(false)

  const handleOpenChange = (isOpen: boolean): void => {
    if (!isOpen) {
      flow.cancel()
      setConfirming(false)
    }
    onOpenChange(isOpen)
  }
  const close = (): void => { handleOpenChange(false); }
  const isLinked = flow.status?.isLinked === true
  const username = flow.status?.username ?? ''

  const renderBody = () => {
    if (isLinked && flow.status) {
      if (isConfirming) {
        return (
          <TelegramUnlinkConfirm
            username={username}
            pending={flow.state === 'unlinking'}
            onCancel={() => { setConfirming(false); }}
            onConfirm={() => {
              setConfirming(false)
              flow.unlink()
            }}
          />
        )
      }
      return (
        <TelegramLinkedPanel
          username={username}
          linkedAt={flow.status.linkedAt ?? ''}
          notificationsEnabled={flow.status.notificationsEnabled ?? false}
          togglePending={flow.state === 'unlinking'}
          error={flow.toggleErrorMessage !== null ? 'Сервер не принял изменение, переключатель вернулся в прежнее положение. Повторите позже.' : (flow.unlinkErrorMessage ?? undefined)}
          onToggleNotifications={flow.toggleNotifications}
          onUnlink={() => { setConfirming(true); }}
          onClose={close}
        />
      )
    }
    if (flow.state === 'not-configured') return <NotConfigured onClose={close} />
    return (
      <TelegramConnectPanel
        status={toConnectStatus(flow.state)}
        botName={flow.botUsername ?? undefined}
        link={flow.state === 'waiting' ? 'reopen' : undefined}
        secondsLeft={flow.state === 'waiting' ? Math.ceil(flow.remainingMs / 1000) : undefined}
        error={flow.state === 'error' ? (flow.errorMessage ?? FALLBACK_ERROR_TEXT) : undefined}
        onConnect={flow.connect}
        onOpenLink={flow.reopenLink}
        onCancel={flow.cancel}
        onRenew={flow.connect}
        onClose={close}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent title="Telegram" className="max-w-[440px] pt-6 [&>div:first-child]:hidden">
        {renderBody()}
      </DialogContent>
    </Dialog>
  )
}
