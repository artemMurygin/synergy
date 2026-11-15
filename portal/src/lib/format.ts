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
