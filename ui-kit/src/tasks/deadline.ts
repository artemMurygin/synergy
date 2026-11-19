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
