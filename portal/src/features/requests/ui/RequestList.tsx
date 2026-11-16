import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import type { IdeaRequest } from '@/lib/schemas'
import { RequestStatusBadge } from './RequestStatusBadge'
import {
  FILTERS,
  formatHours,
  formatMeta,
  formatReviewerNote,
  formatShortDate,
  matchesFilter,
  monthlyHours,
  type RequestFilter
} from './request-presentation'

export interface RequestListProps {
  items: IdeaRequest[]
  isLoading: boolean
  error: Error | null
  onRetry: () => void
  /** Total number of requests on the server, for the footer counter. */
  total?: number
  /** Queue mode: under the badge show who took the request and since when. */
  showReviewer?: boolean
}

const COLUMNS = 'min-[768px]:grid-cols-[minmax(0,1fr)_220px_110px_100px_150px_20px]'
const CARD = 'overflow-hidden rounded-lg border border-border bg-surface'
const HEAD_CELL = 'text-[11px] font-bold uppercase tracking-[0.6px] text-ink-60'

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('text-ink-40', className)}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[18px] shrink-0 text-ink-40"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function TableHead({ narrow = false }: { narrow?: boolean }) {
  const cols = narrow
    ? 'min-[768px]:grid-cols-[minmax(0,1fr)_180px_90px_90px_130px]'
    : COLUMNS
  return (
    <div
      aria-hidden="true"
      className={cn('hidden gap-4 border-y border-border bg-surface-alt px-5 py-2.5 min-[768px]:grid', cols, narrow && 'border-t-0')}
    >
      <span className={HEAD_CELL}>Заявка</span>
      <span className={HEAD_CELL}>Навык</span>
      <span className={HEAD_CELL}>Экономия</span>
      <span className={HEAD_CELL}>Подана</span>
      <span className={HEAD_CELL}>Статус</span>
      {narrow ? null : <span />}
    </div>
  )
}

function Skeleton({ className }: { className: string }) {
  return <div className={cn('rounded-pill bg-surface-sunken', className)} />
}

function LoadingState() {
  const rows = [
    ['w-[260px]', 'w-[160px]'],
    ['w-[200px]', 'w-[140px]'],
    ['w-[300px]', 'w-[180px]']
  ] as const
  return (
    <div role="status" className={CARD}>
      <span className="sr-only">Загружаем заявки…</span>
      <TableHead narrow />
      <div aria-hidden="true">
        {rows.map(([a, b], i) => (
          <div
            key={i}
            className="flex h-[60px] items-center gap-4 border-b border-border px-5 last:border-b-0 min-[768px]:grid min-[768px]:grid-cols-[minmax(0,1fr)_180px_90px_90px_130px]"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className={cn('h-3 max-w-full', a)} />
              <Skeleton className={cn('h-2 max-w-full', b)} />
            </div>
            <Skeleton className="hidden h-2.5 w-[140px] min-[768px]:block" />
            <Skeleton className="hidden h-2.5 w-[60px] min-[768px]:block" />
            <Skeleton className="hidden h-2.5 w-[70px] min-[768px]:block" />
            <Skeleton className="h-6 w-[110px]" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className={CARD}>
      <TableHead narrow />
      <div className="flex flex-col gap-3 p-5">
        <div role="alert" className="flex items-start gap-2.5 rounded-md bg-brand-red-soft px-3.5 py-3">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[18px] shrink-0 text-brand-red"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-[13px] font-semibold text-ink">Не удалось загрузить заявки</p>
            <p className="text-xs leading-[1.4] text-ink-80">{error.message}</p>
            <button
              type="button"
              onClick={onRetry}
              className="self-start rounded-sm text-[13px] font-semibold text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Повторить
            </button>
          </div>
        </div>
        {[0, 1].map((i) => (
          <div key={i} aria-hidden="true" className="flex items-center gap-4 py-2 opacity-50">
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="hidden h-2.5 w-[90px] min-[768px]:block" />
            <Skeleton className="h-6 w-[110px]" />
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className={cn(CARD, 'flex justify-center px-6 py-5')}>
      <div className="flex w-full max-w-[520px] flex-col items-center gap-3 py-2">
        <div className="flex size-[52px] items-center justify-center rounded-pill bg-brand-red-soft text-brand-red">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
          >
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
            <path d="M9 18h6" />
            <path d="M10 22h4" />
          </svg>
        </div>
        <p className="font-display text-xl font-bold text-ink">Заявок пока нет</p>
        <p className="text-center text-sm leading-[1.45] text-ink-60">
          У вас пока нет заявок. Расскажите, какая рутина отнимает время, — разработчики превратят её в навык агента.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {['Сверка актов', 'Письма по шаблону', 'Еженедельный отчёт'].map((example) => (
            <span
              key={example}
              className="inline-flex h-8 items-center rounded-pill border border-border-strong bg-surface px-[18px] text-sm font-medium text-ink"
            >
              {example}
            </span>
          ))}
        </div>
        <Button asChild>
          <Link to="/ideas/new">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-[18px]"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Подать идею
          </Link>
        </Button>
      </div>
    </div>
  )
}

function RequestRow({ request, showReviewer }: { request: IdeaRequest; showReviewer: boolean }) {
  const code = request.status.code
  const hours = monthlyHours(request)
  const skill = request.skill
  const reviewerNote = showReviewer && code === 'under_review' ? formatReviewerNote(request) : null
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to={`/requests/${request.id}`}
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          'min-[768px]:h-[68px] min-[768px]:gap-x-4 min-[768px]:px-5 min-[768px]:py-0',
          COLUMNS
        )}
      >
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-[15px] font-semibold leading-[1.3] text-ink [overflow-wrap:anywhere] min-[768px]:leading-[normal]">
            {request.title}
          </span>
          <span className="text-xs text-ink-60">{formatMeta(request)}</span>
        </span>
        <span className="hidden min-w-0 flex-col gap-[3px] min-[768px]:flex">
          {skill ? (
            <span className="truncate text-[13px] font-medium text-ink">{skill.name}</span>
          ) : (
            <span className="text-[13px] text-ink-40">{code === 'rejected' ? 'Причина в заявке' : 'Ждёт решения'}</span>
          )}
        </span>
        <span
          className={cn('hidden text-sm font-semibold min-[768px]:block', code === 'rejected' ? 'text-ink-40' : 'text-ink')}
        >
          ≈ {formatHours(hours)} ч
        </span>
        <time dateTime={request.createdAt} className="hidden text-[13px] text-ink-60 min-[768px]:block">
          {formatDate(request.createdAt)}
        </time>
        <span className="row-start-2 flex min-w-0 flex-col items-start gap-1 justify-self-start min-[768px]:row-auto">
          <RequestStatusBadge status={code} />
          {reviewerNote ? <span className="max-w-full truncate text-xs text-ink-60">{reviewerNote}</span> : null}
        </span>
        <Chevron className="col-start-2 row-start-1 size-[18px] min-[768px]:col-auto min-[768px]:row-auto min-[768px]:size-5" />
        <span className="col-start-2 row-start-2 text-xs text-ink-60 min-[768px]:hidden">
          ≈ {formatHours(hours)} ч/мес · {formatShortDate(request.createdAt)}
        </span>
      </Link>
    </li>
  )
}

export function RequestList({ items, isLoading, error, onRetry, total, showReviewer = false }: RequestListProps) {
  const [filter, setFilter] = useState<RequestFilter>('all')
  const [query, setQuery] = useState('')

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const needle = query.trim().toLowerCase()
  const visible = sorted.filter(
    (r) => matchesFilter(r, filter) && (needle === '' || r.title.toLowerCase().includes(needle))
  )
  const count = (f: RequestFilter) => items.filter((r) => matchesFilter(r, f)).length
  // The mobile mockup shows "В работе", "Запущено", "На рассмотрении" first.
  const mobileOrder: Record<RequestFilter, string> = {
    all: 'order-1',
    in_work: 'order-2',
    launched: 'order-3',
    new: 'order-4',
    under_review: 'order-4',
    rejected: 'order-5'
  }

  return (
    <div className="flex flex-col gap-4 min-[768px]:gap-0">
      <div className="flex flex-col gap-4 min-[768px]:gap-0 min-[768px]:overflow-hidden min-[768px]:rounded-lg min-[768px]:border min-[768px]:border-border min-[768px]:bg-surface">
        <div className="flex flex-col gap-4 min-[768px]:flex-row min-[768px]:items-center min-[768px]:gap-2 min-[768px]:px-5 min-[768px]:py-4">
          <div role="group" aria-label="Фильтр по статусу" className="flex gap-2 overflow-x-auto max-[767px]:[scrollbar-width:none] min-[768px]:overflow-visible">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-pill border px-[18px] text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  mobileOrder[id],
                  'min-[768px]:order-none',
                  filter === id ? 'border-ink bg-ink text-white' : 'border-border-strong bg-surface text-ink'
                )}
              >
                {label} · {count(id)}
              </button>
            ))}
          </div>
          <div className="hidden min-[768px]:block min-[768px]:flex-1" />
          <label className="hidden h-10 w-[260px] items-center gap-2.5 rounded-md border border-border-strong bg-surface px-4 min-[768px]:flex">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по заявкам"
              aria-label="Поиск по заявкам"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-40"
            />
          </label>
        </div>
        <TableHead />
        <ul className={cn(CARD, 'min-[768px]:rounded-none min-[768px]:border-0')}>
          {visible.map((request) => (
            <RequestRow key={request.id} request={request} showReviewer={showReviewer} />
          ))}
        </ul>
        {visible.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-ink-60">Ничего не найдено</p>
        ) : null}
        <div className="hidden items-center justify-between px-5 py-3 text-xs text-ink-60 min-[768px]:flex">
          <span>
            Показано {visible.length} из {total ?? items.length}
          </span>
          <span className="flex items-center gap-1.5">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 text-ink-40"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            Экономия = частота × минуты × число людей, за месяц
          </span>
        </div>
      </div>
    </div>
  )
}
