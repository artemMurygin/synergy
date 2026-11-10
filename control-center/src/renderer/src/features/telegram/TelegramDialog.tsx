import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { TelegramConnectPanel, type TelegramConnectPanelState } from './TelegramConnectPanel'
import { TelegramLinkedPanel } from './TelegramLinkedPanel'
import { useTelegramLinkFlow, type TelegramLinkFlowState } from './use-telegram-link-flow'

interface TelegramDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const toConnectPanelState = (state: TelegramLinkFlowState): TelegramConnectPanelState =>
  state === 'linked' || state === 'unlinking' ? 'loading' : state

export function TelegramDialog({ open, onOpenChange }: TelegramDialogProps) {
  const flow = useTelegramLinkFlow()

  const handleOpenChange = (isOpen: boolean): void => {
    if (!isOpen) flow.cancel()
    onOpenChange(isOpen)
  }
  const close = (): void => handleOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[440px] rounded-xl" aria-describedby={undefined}>
        <div className="flex h-16 items-center pr-16 pl-6">
          <DialogTitle className="font-display text-xl leading-[26px] font-bold text-ink">Telegram</DialogTitle>
        </div>
        {flow.status?.isLinked === true ? (
          <TelegramLinkedPanel
            status={flow.status}
            isUnlinking={flow.state === 'unlinking'}
            toggleErrorMessage={flow.toggleErrorMessage}
            unlinkErrorMessage={flow.unlinkErrorMessage}
            onToggleNotifications={flow.toggleNotifications}
            onUnlink={flow.unlink}
            onDone={close}
          />
        ) : (
          <TelegramConnectPanel
            state={toConnectPanelState(flow.state)}
            botUsername={flow.botUsername}
            remainingMs={flow.remainingMs}
            errorMessage={flow.errorMessage}
            onConnect={flow.connect}
            onReopenLink={flow.reopenLink}
            onCancel={flow.cancel}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
