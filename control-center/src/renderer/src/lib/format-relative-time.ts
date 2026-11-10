const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const DAYS_IN_WEEK = 7

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

function pluralizeDays(count: number): string {
  const lastTwoDigits = count % 100
  const lastDigit = count % 10
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'дней'
  if (lastDigit === 1) return 'день'
  if (lastDigit >= 2 && lastDigit <= 4) return 'дня'
  return 'дней'
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const elapsedMs = now.getTime() - date.getTime()
  if (elapsedMs < MINUTE_MS) return 'только что'
  if (elapsedMs < HOUR_MS) return `${String(Math.floor(elapsedMs / MINUTE_MS))} мин назад`
  if (elapsedMs < DAY_MS) return `${String(Math.floor(elapsedMs / HOUR_MS))} ч назад`
  const calendarDays = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (calendarDays <= 1) return 'вчера'
  if (calendarDays < DAYS_IN_WEEK) return `${String(calendarDays)} ${pluralizeDays(calendarDays)} назад`
  const label = `${String(date.getDate())} ${SHORT_MONTHS[date.getMonth()] ?? ''}`
  return date.getFullYear() === now.getFullYear() ? label : `${label} ${String(date.getFullYear())}`
}
