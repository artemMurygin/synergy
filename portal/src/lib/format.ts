import type { FrequencyPeriod } from './schemas'

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const PERIOD_SHORT: Record<FrequencyPeriod, string> = { day: 'в день', week: 'в нед.', month: 'в мес.' }

export function formatFrequency(frequency: { count: number; period: FrequencyPeriod }): string {
  return `${String(frequency.count)} ${PERIOD_SHORT[frequency.period]}`
}

/** «16 ч»; «—» while the developer has not given an estimate (requests accepted before estimates existed). */
export function formatEffortHours(hours: number | null): string {
  return hours === null ? '—' : `${String(hours)} ч`
}

/** «14 ноября, 15:42» — local time, no year. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}
