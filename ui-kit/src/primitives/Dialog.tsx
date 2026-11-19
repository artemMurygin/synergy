import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { X } from '../icons'
import { cn } from '../lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export type DialogContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  title: string
  description?: string
  footer?: ReactNode
  closeLabel?: string
}

export function DialogContent({
  title,
  description,
  footer,
  closeLabel = 'Закрыть',
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <DialogPrimitive.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-32px)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-surface shadow-[0_12px_32px_var(--color-shadow-card)] outline-none',
          className,
        )}
        {...props}
      >
        <div className="flex h-16 items-center pr-4 pl-6">
          <DialogPrimitive.Title className="flex-1 font-display text-xl font-bold text-ink">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="flex size-11 items-center justify-center rounded-md text-ink-60 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <X />
          </DialogPrimitive.Close>
        </div>
        {description ? (
          <DialogPrimitive.Description className="px-6 pb-2 text-sm text-ink-60">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        <div className="flex flex-col gap-4 overflow-auto px-6 pb-2">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-3 px-6 pt-4 pb-6">{footer}</div> : <div className="pb-4" />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
