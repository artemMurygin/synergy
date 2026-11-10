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
