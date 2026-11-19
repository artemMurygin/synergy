import * as React from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'flex min-h-[88px] w-full resize-y rounded-md border border-border bg-surface px-3 py-2.5 text-sm transition-colors placeholder:text-ink-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}
