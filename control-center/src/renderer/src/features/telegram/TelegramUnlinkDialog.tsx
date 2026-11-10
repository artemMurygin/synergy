import { AlertDialog } from 'radix-ui'
import { LoaderCircle, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dialogSurfaceClass, overlayClass, useRestoreFocus } from '@/components/ui/dialog'
import { outlineChipClass } from './telegram-panel-parts'

interface TelegramUnlinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string | null
  isPending: boolean
  onConfirm: () => void
}

const unlinkDescription = (username: string | null): string =>
  `Уведомления перестанут приходить в ${username ?? 'Telegram'}. Подключить Telegram снова можно в любой момент.`

export function TelegramUnlinkDialog({ open, onOpenChange, username, isPending, onConfirm }: TelegramUnlinkDialogProps) {
  const restoreFocus = useRestoreFocus()
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content
          className={`${dialogSurfaceClass} flex w-[440px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-xl p-6`}
          {...restoreFocus}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-red-soft">
            <Unlink aria-hidden className="size-[22px] text-brand-red" />
          </div>
          <AlertDialog.Title className="font-display text-xl leading-[26px] font-bold text-ink">
            Отключить Telegram?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm leading-5 text-ink-60">
            {unlinkDescription(username)}
          </AlertDialog.Description>
          <div className="flex justify-end gap-3 pt-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="ghost" className={`${outlineChipClass} disabled:opacity-50`} disabled={isPending}>
                Отмена
              </Button>
            </AlertDialog.Cancel>
            <Button
              type="button"
              className="h-11 rounded-lg bg-destructive px-6 text-[15px] font-semibold text-surface hover:bg-destructive/90 disabled:opacity-100 [&_svg]:size-4"
              disabled={isPending}
              aria-busy={isPending}
              onClick={onConfirm}
            >
              {isPending && <LoaderCircle aria-hidden className="animate-spin" />}
              {isPending ? 'Отключаем…' : 'Отключить'}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
