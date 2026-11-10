import { cn } from '@/lib/utils'

const MAX_SHOWN_COUNT = 99

interface UnreadBadgeProps {
  count: number
  className?: string
}

export function UnreadBadge({ count, className }: UnreadBadgeProps) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-red px-[5px] text-[10px] leading-none font-bold text-white ring-2 ring-surface-alt',
        className
      )}
    >
      {count > MAX_SHOWN_COUNT ? `${String(MAX_SHOWN_COUNT)}+` : String(count)}
    </span>
  )
}
