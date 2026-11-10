// Genitive month names as in the design ("12 декабря"); Intl adds "г." and "в"
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря'
]

const pad = (n: number): string => String(n).padStart(2, '0')
const time = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** "12 декабря 2026, 18:00" in local time. */
export function formatFullDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time(d)}`
}

/** "сегодня, 14:20" / "вчера, 14:20" / "12 ноября, 14:20"; the year is added when it is not the current one. */
export function formatRelativeDateTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (sameDay(d, now)) return `сегодня, ${time(d)}`
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (sameDay(d, yesterday)) return `вчера, ${time(d)}`
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${time(d)}`
}
