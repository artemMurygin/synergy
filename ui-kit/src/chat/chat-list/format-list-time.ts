const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

const pad = (n: number) => String(n).padStart(2, '0')
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const daysAgo = (date: Date, now: Date) => Math.round((dayStart(now) - dayStart(date)) / 86_400_000)

export type ChatGroup = 'Сегодня' | 'Вчера' | 'Ранее'

/** Time of the last activity for a compact row: "14:20", "Вчера", "3 ноября", "3 ноября 2025". */
export function formatListTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const days = daysAgo(date, now)
  if (days === 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (days === 1) return 'Вчера'
  const label = `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''}`
  return date.getFullYear() === now.getFullYear() ? label : `${label} ${String(date.getFullYear())}`
}

export function groupOf(iso: string, now: Date = new Date()): ChatGroup {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Ранее'
  const days = daysAgo(date, now)
  if (days <= 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  return 'Ранее'
}
