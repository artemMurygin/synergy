const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000

const dayMonthFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / MS_PER_SECOND))
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`
}

export function formatLinkedAt(linkedAt: string): string {
  const date = new Date(linkedAt)
  return `${dayMonthFormat.format(date)} ${String(date.getFullYear())}, ${timeFormat.format(date)}`
}

export function formatTelegramUsername(username: string | null | undefined): string | null {
  return username ? `@${username}` : null
}

export function telegramStatusLabel(status: { isLinked: boolean; username?: string | null }): string {
  return status.isLinked ? (formatTelegramUsername(status.username) ?? 'Подключён') : 'Не подключён'
}
