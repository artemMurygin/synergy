import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/* Run Notice / Master: soft background, 18px icon, title 13/600, text 12 with 1.4 line height */
const alertVariants = cva('flex items-start gap-2.5 rounded-md px-3.5 py-3 font-sans', {
  variants: {
    tone: {
      error: 'bg-brand-red-soft',
      info: 'bg-info-soft',
      success: 'bg-success-soft'
    }
  },
  defaultVariants: { tone: 'error' }
})

const iconTone = { error: 'text-brand-red', info: 'text-info', success: 'text-success' } as const

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  title?: string
}

function AlertIcon({ tone }: { tone: keyof typeof iconTone }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('size-[18px] shrink-0', iconTone[tone])}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      {tone === 'success' ? (
        <path d="m9 12 2 2 4-4" />
      ) : (
        <>
          <line x1="12" x2="12" y1={tone === 'info' ? '16' : '8'} y2={tone === 'info' ? '12' : '12'} />
          <line x1="12" x2="12.01" y1={tone === 'info' ? '8' : '16'} y2={tone === 'info' ? '8' : '16'} />
        </>
      )}
    </svg>
  )
}

export function Alert({ className, tone, title, children, ...props }: AlertProps) {
  const resolved = tone ?? 'error'
  return (
    <div role={resolved === 'error' ? 'alert' : 'status'} className={cn(alertVariants({ tone: resolved }), className)} {...props}>
      <AlertIcon tone={resolved} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="text-[13px] font-semibold text-ink">{title}</p> : null}
        {children ? <div className="text-xs leading-[1.4] text-ink-80">{children}</div> : null}
      </div>
    </div>
  )
}
