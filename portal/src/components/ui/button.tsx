import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-[9px] whitespace-nowrap font-sans text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:text-ink-40',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-red hover:bg-brand-red-hover disabled:bg-surface-sunken disabled:shadow-none',
        outline: 'border border-border-strong bg-surface text-ink hover:bg-surface-alt disabled:bg-surface-alt',
        ghost: 'text-ink hover:bg-surface-alt disabled:bg-transparent'
      },
      size: {
        default: 'h-12 rounded-lg px-6',
        sm: 'h-9 rounded-lg px-6'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  )
}
