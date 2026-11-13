import type { IdeaRequest, RequestStatusCode } from '@/lib/schemas'

export type RequestFilter = 'all' | 'pending' | 'in_work' | 'launched' | 'rejected'

export const FILTERS: { id: RequestFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'pending', label: 'На рассмотрении' },
  { id: 'in_work', label: 'В работе' },
  { id: 'launched', label: 'Запущено' },
  { id: 'rejected', label: 'Отклонены' }
]

const IN_WORK: readonly RequestStatusCode[] = ['planned', 'in_dev', 'testing']

export function matchesFilter(request: IdeaRequest, filter: RequestFilter): boolean {
  const code = request.status.code
  if (filter === 'all') return true
  if (filter === 'in_work') return IN_WORK.includes(code)
  return code === filter
}

const WEEKS_IN_MONTH = 4.33
const RUNS_PER_MONTH = { day: 30, week: WEEKS_IN_MONTH, month: 1 } as const

/** Saved hours per month: frequency x minutes x people. */
export function monthlyHours(request: IdeaRequest): number {
  const { count, period } = request.frequency
  return (count * RUNS_PER_MONTH[period] * request.minutesPerRun * request.peopleCount) / 60
}

export function formatHours(hours: number): string {
  if (hours >= 10) return String(Math.floor(hours))
  const rounded = Math.round(hours * 10) / 10
  return String(rounded).replace('.', ',')
}

function pluralTimes(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'раза' : 'раз'
}

const PERIOD_FULL = { day: 'в день', week: 'в неделю', month: 'в месяц' } as const

export function formatMeta(request: IdeaRequest): string {
  const { count, period } = request.frequency
  return `${String(count)} ${pluralTimes(count)} ${PERIOD_FULL[period]} · ${String(request.minutesPerRun)} мин · ${String(request.peopleCount)} чел.`
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}
