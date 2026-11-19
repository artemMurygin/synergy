import { cva, type VariantProps } from 'class-variance-authority'
import { Dialog as SheetPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { X } from '../icons'
import { cn } from '../lib/cn'

export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger
export const SheetClose = SheetPrimitive.Close

const sheetVariants = cva('fixed z-50 flex flex-col bg-surface shadow-[0_12px_32px_var(--color-shadow-card)] outline-none', {
  variants: {
    side: {
      right: 'inset-y-0 right-0 w-[min(420px,100vw)] rounded-l-xl',
      left: 'inset-y-0 left-0 w-[min(420px,100vw)] rounded-r-xl',
      top: 'inset-x-0 top-0 max-h-[90vh] rounded-b-xl',
      bottom: 'inset-x-0 bottom-0 max-h-[90vh] rounded-t-xl',
    },
  },
  defaultVariants: { side: 'right' },
})

export type SheetContentProps = Omit<ComponentProps<typeof SheetPrimitive.Content>, 'title'> &
  VariantProps<typeof sheetVariants> & {
    title: string
    description?: string
    footer?: ReactNode
    closeLabel?: string
  }

export function SheetContent({
  side = 'right',
  title,
  description,
  footer,
  closeLabel = 'Закрыть',
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <SheetPrimitive.Content
        data-side={side}
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        <div className="flex h-16 shrink-0 items-center pr-4 pl-6">
          <SheetPrimitive.Title className="flex-1 font-display text-xl font-bold text-ink">
            {title}
          </SheetPrimitive.Title>
          <SheetPrimitive.Close
            aria-label={closeLabel}
            className="flex size-11 items-center justify-center rounded-md text-ink-60 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <X />
          </SheetPrimitive.Close>
        </div>
        {description ? (
          <SheetPrimitive.Description className="px-6 pb-2 text-sm text-ink-60">
            {description}
          </SheetPrimitive.Description>
        ) : null}
        <div className="flex flex-1 flex-col gap-4 overflow-auto px-6 pb-2">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-3 px-6 pt-4 pb-6">{footer}</div> : <div className="pb-4" />}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}
