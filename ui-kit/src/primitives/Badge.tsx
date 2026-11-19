import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'

const badgeVariants = cva('inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-pill px-3 py-1.5 text-xs font-semibold', {
  variants: {
    variant: {
      neutral: 'bg-surface-sunken text-ink-80',
      brand: 'bg-brand-red-soft text-brand-red',
      info: 'bg-info-soft text-info',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
    },
  },
  defaultVariants: { variant: 'neutral' },
})

const dotVariants: Record<NonNullable<VariantProps<typeof badgeVariants>['variant']>, string> = {
  neutral: 'bg-ink-60',
  brand: 'bg-brand-red',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
}

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { dot?: boolean }

export function Badge({ variant = 'neutral', dot, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span aria-hidden="true" className={cn('size-[7px] rounded-full', dotVariants[variant ?? 'neutral'])} /> : null}
      {children}
    </span>
  )
}
