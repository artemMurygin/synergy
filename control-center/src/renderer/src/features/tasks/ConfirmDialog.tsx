import { AlertDialog } from 'radix-ui'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dialogSurfaceClass, overlayClass, useRestoreFocus } from '@/components/ui/dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  /** The action is running: both buttons are blocked. */
  pending?: boolean
  onConfirm: () => void
}

/** Confirmation of a destructive action; the caller closes it after the action succeeds. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm
}: ConfirmDialogProps) {
  const restoreFocus = useRestoreFocus()
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content
          className={`${dialogSurfaceClass} flex w-[400px] max-w-[calc(100vw-32px)] flex-col gap-4 p-6`}
          {...restoreFocus}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-red-soft">
            <Trash2 aria-hidden className="size-[22px] text-brand-red" />
          </div>
          <AlertDialog.Title className="text-xl font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <div className="flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="outline" className="h-11 rounded-full px-6" disabled={pending}>
                Отмена
              </Button>
            </AlertDialog.Cancel>
            <Button
              type="button"
              variant="destructive"
              className="h-11 rounded-full px-6"
              disabled={pending}
              aria-busy={pending}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
