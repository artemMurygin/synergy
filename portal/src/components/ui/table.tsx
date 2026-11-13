import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}
export const TableHeader = (p: React.ComponentProps<'thead'>) => (
  <thead {...p} className={cn('border-b border-border bg-surface-alt', p.className)} />
)
export const TableBody = (p: React.ComponentProps<'tbody'>) => (
  <tbody {...p} className={cn('[&_tr:last-child]:border-0', p.className)} />
)
export const TableRow = (p: React.ComponentProps<'tr'>) => (
  <tr {...p} className={cn('border-b border-border transition-colors hover:bg-surface-alt', p.className)} />
)
export const TableHead = (p: React.ComponentProps<'th'>) => (
  <th
    {...p}
    className={cn('px-5 py-2.5 text-left align-middle text-[11px] font-bold uppercase tracking-[0.6px] text-ink-60', p.className)}
  />
)
export const TableCell = (p: React.ComponentProps<'td'>) => (
  <td {...p} className={cn('px-5 py-3.5 align-middle text-ink', p.className)} />
)
