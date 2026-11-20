import type { TaskStatus } from './types'

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

const pad = (n: number): string => String(n).padStart(2, '0')
const time = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Открытая задача с дедлайном в прошлом. */
export function isOverdue(status: TaskStatus, deadline: string | null, now: Date = new Date()): boolean {
  if (status === 'done' || deadline === null) return false
  return new Date(deadline).getTime() < now.getTime()
}

/** «12 дек, 18:00» */
export function formatDeadline(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate())} ${MONTHS_SHORT[d.getMonth()] ?? ''}, ${time(d)}`
}

/** «5 ноя» */
export function formatDay(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate())} ${MONTHS_SHORT[d.getMonth()] ?? ''}`
}

/** «12 декабря 2026, 18:00» */
export function formatFullDateTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate())} ${MONTHS_GEN[d.getMonth()] ?? ''} ${String(d.getFullYear())}, ${time(d)}`
}

/** «сегодня, 14:20» / «вчера, 14:20» / «12 ноября, 14:20» (год — если не текущий). */
export function formatRelativeDateTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (sameDay(d, now)) return `сегодня, ${time(d)}`
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (sameDay(d, yesterday)) return `вчера, ${time(d)}`
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${String(d.getFullYear())}`
  return `${String(d.getDate())} ${MONTHS_GEN[d.getMonth()] ?? ''}${year}, ${time(d)}`
}

/** Значение `<input type="datetime-local">` в локальной зоне. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string | null {
  if (value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export type QuickDeadlineKind = 'today' | 'tomorrow' | 'week'

const QUICK_OFFSET: Record<QuickDeadlineKind, number> = { today: 0, tomorrow: 1, week: 7 }
const DEFAULT_HOUR = 18

/** Быстрый срок: день от `now`; время берётся из `current`, без него — 18:00. */
export function quickDeadline(kind: QuickDeadlineKind, now: Date, current: Date | null): Date {
  const hours = current ? current.getHours() : DEFAULT_HOUR
  const minutes = current ? current.getMinutes() : 0
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + QUICK_OFFSET[kind], hours, minutes)
}

export type DeadlineGroupKey = 'overdue' | 'week' | 'later' | 'none'

export const DEADLINE_GROUP_LABEL: Record<DeadlineGroupKey, string> = {
  overdue: 'Просрочено',
  week: 'На этой неделе',
  later: 'Позже',
  none: 'Без срока',
}

const GROUP_ORDER: DeadlineGroupKey[] = ['overdue', 'week', 'later', 'none']
const WEEK_DAYS = 7

export type DeadlineGroup<T> = { key: DeadlineGroupKey; label: string; items: T[] }

/** Группы по сроку в порядке показа; пустые не возвращаются. «На этой неделе» — ближайшие 7 дней. */
export function groupByDeadline<T extends { status: TaskStatus; deadline: string | null }>(
  items: readonly T[],
  now: Date = new Date(),
): DeadlineGroup<T>[] {
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + WEEK_DAYS).getTime()
  const buckets: Record<DeadlineGroupKey, T[]> = { overdue: [], week: [], later: [], none: [] }
  for (const item of items) {
    if (item.deadline === null) buckets.none.push(item)
    else if (isOverdue(item.status, item.deadline, now)) buckets.overdue.push(item)
    else if (new Date(item.deadline).getTime() < weekEnd) buckets.week.push(item)
    else buckets.later.push(item)
  }
  return GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: DEADLINE_GROUP_LABEL[key],
    items: buckets[key],
  }))
}
