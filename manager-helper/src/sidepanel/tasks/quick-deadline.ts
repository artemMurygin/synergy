import { quickDeadline } from '@synergy/ui-kit'
import type { QuickDeadlineKind } from '@synergy/ui-kit'

/** ISO of the quick deadline: the day from `now`, the time of the current deadline or 18:00. */
export function quickDeadlineIso(kind: QuickDeadlineKind, now: Date, current: Date | null): string {
  return quickDeadline(kind, now, current).toISOString()
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

/** Label of the "Дата…" chip once a date is chosen: «12 дек, 18:00». */
export function formatDeadlineChip(date: Date): string {
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}
