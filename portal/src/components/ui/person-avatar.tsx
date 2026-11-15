import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

/* Avatar / Master: round, surface-sunken, initials 11/600 ink-80 */
export function PersonAvatar({ fullName, className }: { fullName: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-semibold text-ink-80', className)}
    >
      {initials(fullName)}
    </span>
  )
}
