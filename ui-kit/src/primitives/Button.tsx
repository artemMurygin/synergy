import { cva } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'h-12 rounded-xl bg-brand-red px-6 text-[15px] text-white shadow-[0_8px_4px_var(--color-shadow-red)] hover:bg-brand-red-hover',
        secondary:
          'h-11 rounded-xl border border-border-strong bg-surface px-6 text-[15px] text-ink hover:bg-surface-alt',
        ghost: 'h-11 rounded-xl bg-transparent px-4 text-[15px] text-ink-80 hover:bg-surface-alt',
        'icon-round':
          'size-11 rounded-full bg-transparent p-0 text-ink-80 hover:bg-surface-alt',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
)

type BaseProps = Omit<ComponentProps<'button'>, 'aria-label'>

export type ButtonProps =
  | (BaseProps & {
      variant?: 'primary' | 'secondary' | 'ghost'
      'aria-label'?: string
    })
  | (BaseProps & { variant: 'icon-round'; 'aria-label': string })

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />
}
