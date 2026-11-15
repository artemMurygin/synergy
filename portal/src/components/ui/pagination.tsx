import { Button } from './button'

export interface PaginationProps {
  /** zero-based */
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
  </svg>
)

/* Pagination / Master: "Показано X–Y из N" on the left, "Назад" / "Вперёд" outline buttons on the right */
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const hasNext = (page + 1) * pageSize < total
  if (page === 0 && !hasNext) return null
  const from = Math.min(page * pageSize + 1, total)
  const to = Math.min((page + 1) * pageSize, total)
  return (
    <nav aria-label="Страницы" className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
      <p aria-live="polite" className="text-[13px] text-ink-60 sm:flex-1">
        <span className="hidden sm:inline">Показано </span>
        {`${String(from)}–${String(to)} из ${String(total)}`}
      </p>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button variant="outline" size="sm" className="h-11 flex-1 gap-[9px] rounded-md px-3.5 text-sm sm:h-9 sm:flex-none" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          <Chevron dir="left" />
          Назад
        </Button>
        <Button variant="outline" size="sm" className="h-11 flex-1 gap-[9px] rounded-md px-3.5 text-sm sm:h-9 sm:flex-none" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>
          Вперёд
          <Chevron dir="right" />
        </Button>
      </div>
    </nav>
  )
}
