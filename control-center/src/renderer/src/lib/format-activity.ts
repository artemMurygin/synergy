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

const pad = (n: number) => String(n).padStart(2, '0')
const time = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "Сегодня, 14:20" / "Вчера, 18:40" / "3 ноября" / "3 ноября 2025". */
export function formatActivity(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const days = Math.round((dayStart(now) - dayStart(date)) / 86_400_000)
  if (days === 0) return `Сегодня, ${time(date)}`
  if (days === 1) return `Вчера, ${time(date)}`
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  return date.getFullYear() === now.getFullYear() ? label : `${label} ${date.getFullYear()}`
}
