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
  'декабря',
]

function time(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatActivity(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const days = Math.round((dayStart(now) - dayStart(date)) / 86_400_000)
  if (days === 0) return `Сегодня, ${time(date)}`
  if (days === 1) return `Вчера, ${time(date)}`
  const label = `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''}`
  return date.getFullYear() === now.getFullYear() ? label : `${label} ${String(date.getFullYear())}`
}
