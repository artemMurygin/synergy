import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-[7px] rounded-pill px-3 py-1.5 font-sans text-xs font-semibold',
  {
    variants: {
      tone: {
        red: 'bg-brand-red-soft text-brand-red',
        neutral: 'bg-surface-sunken text-ink-80',
        info: 'bg-info-soft text-info',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning/15 text-warning'
      }
    },
    defaultVariants: { tone: 'red' }
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Hides the leading status dot (Comment Item role mark). */
  hideDot?: boolean
}

export function Badge({ className, tone, hideDot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {hideDot ? null : <span aria-hidden="true" className="size-[7px] rounded-full bg-current" />}
      {children}
    </span>
  )
}
