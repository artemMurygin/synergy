const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function strip(text: string): string {
  return text.replace('.', '')
}

/** "12 дек, 18:00" */
export function formatDeadline(iso: string): string {
  return strip(DATE_TIME.format(new Date(iso)))
}

/** "5 ноя" */
export function formatDay(iso: string): string {
  return strip(DATE.format(new Date(iso)))
}

export function isOverdue(deadline: string | null, status: string, now: Date): boolean {
  return deadline !== null && status !== 'done' && Date.parse(deadline) < now.getTime()
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Value of `<input type="datetime-local">` in the local time zone. */
export function toLocalInput(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value: string): string | null {
  if (value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`
}

export function messageOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : 'Неизвестная ошибка'
}

export interface QuickDeadlines {
  /** Today, 18:00. */
  today: string
  /** Tomorrow, 10:00. */
  tomorrow: string
  /** The nearest Monday after today, 10:00. */
  nextMonday: string
}

function localInputAt(base: Date, addDays: number, hours: number): string {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + addDays, hours, 0)
  return toLocalInput(date.toISOString())
}

/** Quick deadline options as `datetime-local` values in the local time zone. */
export function quickDeadlines(now: Date): QuickDeadlines {
  // Monday is 1; on a Monday the next one is a week away.
  const untilMonday = (8 - now.getDay()) % 7 || 7
  return {
    today: localInputAt(now, 0, 18),
    tomorrow: localInputAt(now, 1, 10),
    nextMonday: localInputAt(now, untilMonday, 10),
  }
}

/** "Сегодня, 18:00", "Завтра, 10:00" or "16 ноя, 10:00" for a `datetime-local` value. */
export function formatLocalDeadline(value: string, now: Date): string {
  const iso = fromLocalInput(value)
  if (iso === null) return ''
  const date = new Date(iso)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const day = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).toDateString()
  if (date.toDateString() === day(0)) return `Сегодня, ${time}`
  if (date.toDateString() === day(1)) return `Завтра, ${time}`
  return formatDeadline(iso)
}
