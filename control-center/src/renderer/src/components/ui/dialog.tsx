import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

export const overlayClass = 'fixed inset-0 z-50 bg-black/40'
export const dialogSurfaceClass =
  'fixed top-1/2 left-1/2 z-50 max-h-[calc(100vh-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-background shadow-xl outline-none'

/**
 * Radix returns focus only to a `Trigger` element. These dialogs are opened by arbitrary buttons,
 * so the element focused at opening time is remembered and refocused on close.
 */
export function useRestoreFocus() {
  const opener = React.useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: () => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      opener.current?.focus()
    }
  }
}

interface DialogContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  closeLabel?: string
}

export function DialogContent({ className, children, closeLabel = 'Закрыть', ...props }: DialogContentProps) {
  const restoreFocus = useRestoreFocus()
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        className={cn(dialogSurfaceClass, 'w-[520px] max-w-[calc(100vw-32px)]', className)}
        {...restoreFocus}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full text-ink-60 outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
