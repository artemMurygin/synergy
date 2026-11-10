import { formatDay } from '../tasks/format'

export type RelativeTimeMode = 'short' | 'full'

const MINUTE_MS = 60_000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_SHOWN_AS_COUNT = 7

const DAY_PLURALS = new Intl.PluralRules('ru-RU')
const DAY_WORDS: Record<string, string> = { one: 'день', few: 'дня', many: 'дней' }

function daysWord(days: number): string {
  return DAY_WORDS[DAY_PLURALS.select(days)] ?? 'дней'
}

function calendarDaysBetween(earlier: Date, later: Date): number {
  const start = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate())
  const end = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate())
  return Math.round((end - start) / (MINUTE_MS * MINUTES_PER_HOUR * HOURS_PER_DAY))
}

export function formatRelativeTime(iso: string, now: Date, mode: RelativeTimeMode): string {
  const createdAt = new Date(iso)
  const suffix = mode === 'full' ? ' назад' : ''
  const minutes = Math.floor((now.getTime() - createdAt.getTime()) / MINUTE_MS)
  if (minutes < 1) return 'только что'
  if (minutes < MINUTES_PER_HOUR) return `${String(minutes)} мин${suffix}`
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  if (hours < HOURS_PER_DAY) return `${String(hours)} ч${suffix}`
  const days = calendarDaysBetween(createdAt, now)
  if (days <= 1) return 'вчера'
  if (days < DAYS_SHOWN_AS_COUNT) return `${String(days)} ${daysWord(days)}${suffix}`
  const day = formatDay(iso)
  return createdAt.getFullYear() === now.getFullYear()
    ? day
    : `${day} ${String(createdAt.getFullYear())}`
}
