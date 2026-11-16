import type { DepartmentRef } from '@/lib/schemas'
import { cn } from '@/lib/utils'

/** ProductAccessLabel: "Доступно: КЦ 1, КЦ 2" 13 ink-60; nothing for an empty list; a long list wraps. */
export function ProductAccessLabel({ departments, className }: { departments: DepartmentRef[]; className?: string }) {
  if (departments.length === 0) return null
  return <p className={cn('min-w-0 text-[13px] leading-[1.4] break-words text-ink-60', className)}>Доступно: {departments.map((d) => d.name).join(', ')}</p>
}
