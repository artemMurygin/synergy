import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Pagination } from '@/components/ui/pagination'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BugListItem } from '../model/bugs.schema'
import { BugStatusBadge } from './BugStatusBadge'

export interface BugListProps {
  items: BugListItem[]
  total: number
  /** zero-based */
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  /** Queue mode: an extra «Автор» column and line. */
  showAuthor?: boolean
  /** First load only: the skeleton replaces the rows. */
  isLoading?: boolean
  error?: Error | null
  onRetry?: () => void
  /** Shown instead of the list when there are no bugs. */
  empty?: ReactNode
}

const CARD = 'overflow-hidden rounded-lg border border-border bg-surface'
const HEAD_CELL = 'text-[11px] font-bold uppercase tracking-[0.6px] text-ink-60'
const COLUMNS = 'min-[768px]:grid-cols-[minmax(0,1fr)_220px_160px_18px]'
const COLUMNS_WITH_AUTHOR = 'min-[768px]:grid-cols-[minmax(0,1fr)_180px_200px_140px_18px]'

const columns = (showAuthor: boolean) => (showAuthor ? COLUMNS_WITH_AUTHOR : COLUMNS)

function shortDate(iso: string): string {
  return formatDate(iso).slice(0, 5)
}

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
      className={cn('size-[18px] text-ink-40', className)}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function TableHead({ showAuthor }: { showAuthor: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn('hidden gap-4 bg-surface-alt px-5 py-2.5 min-[768px]:grid', columns(showAuthor))}
    >
      <span className={HEAD_CELL}>Обращение</span>
      <span className={HEAD_CELL}>Статус</span>
      {showAuthor ? <span className={HEAD_CELL}>Автор</span> : null}
      <span className={HEAD_CELL}>Статус изменён</span>
      <span />
    </div>
  )
}

function Bar({ className }: { className: string }) {
  return <div className={cn('rounded-pill bg-surface-sunken', className)} />
}

function LoadingState() {
  const widths = ['w-[320px]', 'w-[260px]', 'w-[300px]', 'w-[240px]']
  return (
    <div role="status" className={CARD}>
      <span className="sr-only">Загружаем обращения…</span>
      <div aria-hidden="true">
        {widths.map((w, i) => (
          <div key={i} className="flex h-[68px] items-center gap-4 px-5">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bar className={cn('h-3 max-w-full', w)} />
              <Bar className="h-2.5 w-[180px] max-w-full" />
            </div>
            <Bar className="h-6 w-24" />
            <Bar className="hidden h-2.5 w-[72px] min-[768px]:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className={cn(CARD, 'p-5')}>
      <Alert tone="error" title="Не удалось загрузить обращения">
        <p>Проверьте соединение и попробуйте ещё раз.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 rounded-sm text-[13px] font-semibold text-brand-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Повторить
          </button>
        ) : null}
      </Alert>
    </div>
  )
}

function BugRow({ bug, showAuthor }: { bug: BugListItem; showAuthor: boolean }) {
  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        to={`/bugs/${encodeURIComponent(bug.id)}`}
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          'min-[768px]:min-h-[68px] min-[768px]:gap-x-4 min-[768px]:px-5 min-[768px]:py-0',
          columns(showAuthor)
        )}
      >
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-[15px] font-semibold leading-[1.3] text-ink [overflow-wrap:anywhere]">{bug.title}</span>
          <span className="text-xs text-ink-60">{`${bug.product.name} · ${bug.agent.name}`}</span>
        </span>
        <Chevron className="col-start-2 row-start-1 min-[768px]:hidden" />
        <span className="row-start-2 flex items-center justify-self-start min-[768px]:row-auto">
          <BugStatusBadge status={bug.status} />
        </span>
        {showAuthor ? (
          <span className="hidden truncate text-[13px] text-ink-80 min-[768px]:block">{bug.author.fullName}</span>
        ) : null}
        <time
          dateTime={bug.statusChangedAt}
          className="col-start-2 row-start-2 text-xs text-ink-60 min-[768px]:col-auto min-[768px]:row-auto min-[768px]:text-[13px] min-[768px]:text-ink-80"
        >
          <span className="min-[768px]:hidden">{shortDate(bug.statusChangedAt)}</span>
          <span className="hidden min-[768px]:inline">{formatDate(bug.statusChangedAt)}</span>
        </time>
        <Chevron className="hidden min-[768px]:block" />
      </Link>
    </li>
  )
}

export function BugList({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  showAuthor = false,
  isLoading = false,
  error = null,
  onRetry,
  empty
}: BugListProps) {
  if (isLoading) return <LoadingState />
  if (error) return <ErrorState onRetry={onRetry} />
  if (items.length === 0 && empty) return <>{empty}</>
  return (
    <div className={CARD}>
      <TableHead showAuthor={showAuthor} />
      <ul>
        {items.map((bug) => (
          <BugRow key={bug.id} bug={bug} showAuthor={showAuthor} />
        ))}
      </ul>
      <div className="border-t border-border px-4 py-3 empty:hidden min-[768px]:px-5">
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
      </div>
    </div>
  )
}
