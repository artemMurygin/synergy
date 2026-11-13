import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import type { FrequencyPeriod, IdeaRequest } from '@/lib/schemas'
import { useQueue } from './use-queue'


function Icon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

/* lucide icons: chevron-down, clock-alert, inbox, arrow-right */
const ChevronDown = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)
const ClockAlert = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 6v6l4 2" />
    <path d="M16 21.16a10 10 0 1 1 5-13.516" />
    <path d="M20 11.5v6" />
    <path d="M20 21.5h.01" />
  </Icon>
)
const Inbox = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Icon>
)
const ArrowRight = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
)

const HOUR = 3_600_000
const DAY = 24 * HOUR
const LONG_WAIT_DAYS = 5
const TARGET_WAIT_DAYS = 3
/** Working days per month and weeks per month used to turn a frequency into runs per month. */
const RUNS_PER_MONTH: Record<FrequencyPeriod, number> = { day: 21, week: 4.2, month: 1 }
const PERIOD_FULL: Record<FrequencyPeriod, string> = { day: 'в день', week: 'в неделю', month: 'в месяц' }

function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

function effectHours(r: IdeaRequest): number {
  return (RUNS_PER_MONTH[r.frequency.period] * r.frequency.count * r.minutesPerRun * r.peopleCount) / 60
}

function formatHours(hours: number): string {
  return `≈ ${String(Math.max(1, Math.round(hours)))} ч`
}

function formatMeta(r: IdeaRequest): string {
  const { count, period } = r.frequency
  const times = `${String(count)} ${plural(count, 'раз', 'раза', 'раз')} ${PERIOD_FULL[period]}`
  return `${times} · ${String(r.minutesPerRun)} мин · ${String(r.peopleCount)} чел.`
}

function formatWait(ms: number): string {
  const days = Math.floor(ms / DAY)
  if (days >= 1) return `${String(days)} ${plural(days, 'день', 'дня', 'дней')}`
  const hours = Math.floor(ms / HOUR)
  if (hours >= 1) return `${String(hours)} ${plural(hours, 'час', 'часа', 'часов')}`
  return 'меньше часа'
}

function formatDecimal(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

function initials(login: string): string {
  return login.slice(0, 2).toUpperCase()
}

const ROW_GRID =
  'md:grid md:grid-cols-[minmax(0,1fr)_170px_120px_110px_112px] md:items-center md:gap-4'

function Stat({ value, label, note, alert }: { value: string; label: string; note: string; alert?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-[19px]">
      <span className={`font-display text-[32px] font-medium leading-[1.0] ${alert ? 'text-brand-red' : 'text-ink'}`}>{value}</span>
      <span className="text-sm font-semibold leading-4 text-ink">{label}</span>
      <span className="text-xs leading-[17px] text-ink-60">{note}</span>
    </div>
  )
}

export function QueuePage() {
  const [pageNo, setPageNo] = useState(0)
  const query = useQueue(pageNo)
  const data = query.data
  const items = data ? [...data.items].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) : []
  const hasNext = data ? (data.page + 1) * data.limit < data.total : false
  const now = Date.now()
  const waits = items.map((r) => Math.max(0, now - Date.parse(r.createdAt)))
  const total = data?.total ?? items.length
  const weekNew = waits.filter((w) => w < 7 * DAY).length
  const avgDays = waits.length ? waits.reduce((s, w) => s + w, 0) / waits.length / DAY : 0
  const effectSum = items.reduce((s, r) => s + effectHours(r), 0)
  const longWait = waits.filter((w) => w > LONG_WAIT_DAYS * DAY).length
  const isEmpty = !query.isPending && !query.isError && items.length === 0

  return (
    <section className="flex flex-col gap-6">
      {isEmpty ? null : (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[32px] font-bold leading-[1.28] text-ink">Очередь заявок</h1>
            <p className="text-sm leading-4 text-ink-60">Новые идеи ждут решения. Примите заявку в навык или отклоните с причиной.</p>
          </div>
          <div className="flex items-center gap-2 pb-0">
            <span className="text-[13px] text-ink-60">Сортировка</span>
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border-strong bg-surface px-[18px] text-sm font-medium text-ink">
              Сначала старые
              <ChevronDown className="size-3.5 text-ink-60" />
            </span>
          </div>
        </header>
      )}
      {isEmpty ? <h1 className="sr-only">Очередь заявок</h1> : null}
      {query.isPending ? (
        <div role="status" className="flex flex-col gap-2">
          <p className="text-sm text-ink-60">Загружаем очередь…</p>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden="true" className="h-16 animate-pulse rounded-lg bg-surface-alt" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert title="Не удалось загрузить очередь">{query.error.message}</Alert>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="mx-auto flex max-w-[460px] flex-col items-center gap-3.5 pt-[86px] pb-12 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
            <Inbox className="size-7" />
          </span>
          <p className="font-display text-[26px] font-bold leading-tight text-ink">Очередь пуста</p>
          <p className="text-sm leading-[1.5] text-ink-60">
            Все заявки разобраны. Новые появятся здесь, а счётчик в меню подскажет, когда их станет больше.
          </p>
          <Button asChild variant="outline" className="mt-1">
            <Link to="/skills">
              Перейти к навыкам
              <ArrowRight className="size-[18px]" />
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-4">
            <Stat value={String(total)} label="ждут решения" note={`новых за неделю: ${String(weekNew)}`} />
            <Stat
              value={`${formatDecimal(avgDays)} ${Number.isInteger(Math.round(avgDays * 10) / 10) ? plural(Math.round(avgDays), 'день', 'дня', 'дней') : 'дня'}`}
              label="среднее ожидание"
              note={`цель — не дольше ${String(TARGET_WAIT_DAYS)} дней`}
            />
            <Stat value={formatHours(effectSum)} label="эффект в месяц" note="если принять все заявки" />
            <Stat
              value={String(longWait)}
              label={`ждёт дольше ${String(LONG_WAIT_DAYS)} дней`}
              note="стоит разобрать первой"
              alert={longWait > 0}
            />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-surface after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:border after:border-border">
            <div
              aria-hidden="true"
              className={`${ROW_GRID} hidden h-[34px] border-b border-border bg-surface-alt px-5 text-[11px] font-bold leading-[14px] uppercase tracking-[0.08em] text-ink-60`}
            >
              <span>Заявка</span>
              <span>Автор</span>
              <span>Эффект / мес</span>
              <span>Ждёт</span>
              <span />
            </div>
            <ul className="flex flex-col">
              {items.map((request, i) => {
                const wait = waits[i] ?? 0
                const urgent = wait > LONG_WAIT_DAYS * DAY
                return (
                  <li key={request.id} className="border-b border-border last:border-b-0 md:h-[68px]">
                    <Link
                      to={`/requests/${request.id}`}
                      aria-label={request.title}
                      className={`${ROW_GRID} flex flex-col gap-2 px-5 py-4 hover:bg-surface-alt md:h-full md:pb-0 md:pt-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
                    >
                      <span className="flex min-w-0 flex-col gap-[3px]">
                        <span className="break-words text-[15px] font-semibold leading-[18px] text-ink">{request.title}</span>
                        <span className="text-xs leading-[14px] text-ink-60">{formatMeta(request)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="flex size-7 items-center justify-center rounded-full bg-[#ECEDF0] text-[11px] font-semibold text-[#3A3A3A]"
                        >
                          {initials(request.author.login)}
                        </span>
                        <span className="text-[13px] font-medium text-ink">{request.author.login}</span>
                      </span>
                      <span className="text-sm font-semibold text-ink">{formatHours(effectHours(request))}</span>
                      <span className={`flex items-center gap-1.5 text-[13px] ${urgent ? 'font-semibold text-brand-red' : 'text-ink-60'}`}>
                        {urgent ? <ClockAlert className="size-3.5" /> : null}
                        <time dateTime={request.createdAt} title={formatDate(request.createdAt)}>
                          {formatWait(wait)}
                        </time>
                      </span>
                      <span
                        className={`inline-flex h-9 items-center justify-center rounded-lg px-6 text-[15px] font-semibold md:w-[111px] md:justify-self-end md:px-0 ${
                          i === 0
                            ? 'bg-primary text-primary-foreground shadow-red'
                            : 'border border-border-strong bg-surface text-ink'
                        }`}
                      >
                        Открыть
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
      {pageNo > 0 || hasNext ? (
        <nav aria-label="Страницы" className="flex gap-2">
          <Button variant="outline" size="sm" disabled={pageNo === 0} onClick={() => setPageNo(pageNo - 1)}>
            Назад
          </Button>
          <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setPageNo(pageNo + 1)}>
            Вперёд
          </Button>
        </nav>
      ) : null}
    </section>
  )
}
