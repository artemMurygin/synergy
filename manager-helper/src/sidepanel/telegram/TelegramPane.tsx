import { Dialog, DialogContent, Sheet, SheetContent, useLayoutMode } from '@synergy/ui-kit'
import type { TelegramLink } from '@/options/telegram/use-telegram-link'
import { TelegramLinkPanels } from './TelegramLinkPanels'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  link: TelegramLink
}

/** Telegram link in the panel (JLayI, b8m3B, G2zsX, STkbU): a dialog on tablet, a bottom sheet on mobile. */
export function TelegramPane({ open, onOpenChange, link }: Props) {
  const mobile = useLayoutMode() === 'mobile'
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" title="Telegram" className="pb-4">
          <TelegramLinkPanels link={link} />
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Telegram" className="max-w-[440px]">
        <TelegramLinkPanels link={link} />
      </DialogContent>
    </Dialog>
  )
}
