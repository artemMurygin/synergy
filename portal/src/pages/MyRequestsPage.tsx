import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { RequestList } from '@/features/requests'
import { formatHours, matchesFilter, monthlyHours } from '@/features/requests/ui/request-presentation'
import { cn } from '@/lib/utils'
import type { IdeaRequest } from '@/lib/schemas'
import { useMyRequests } from './use-my-requests'

function PlusIcon() {
  return (
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
  )
}

function Stat({
  value,
  label,
  note,
  mobile = true
}: {
  value: string
  label: string
  note: string
  mobile?: boolean
}) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 flex-col gap-1 rounded-lg border border-border bg-surface p-4 min-[768px]:p-5',
        mobile ? 'flex' : 'hidden min-[768px]:flex'
      )}
    >
      <p className="font-display text-[26px] font-medium leading-none tracking-[-1.4px] text-ink min-[768px]:text-[32px]">
        {value}
      </p>
      <p className="text-sm font-semibold text-ink">{label}</p>
      <p className="hidden text-xs leading-[1.45] text-ink-60 min-[768px]:block">{note}</p>
    </div>
  )
}

function Summary({ items, total }: { items: IdeaRequest[]; total: number }) {
  const inWork = items.filter((r) => matchesFilter(r, 'in_work')).length
  const launched = items.filter((r) => matchesFilter(r, 'launched'))
  const saved = launched.reduce((sum, r) => sum + monthlyHours(r), 0)
  return (
    <div className="flex gap-2.5 min-[768px]:gap-4">
      <Stat mobile={false} value={String(total)} label="заявок подано" note="за всё время" />
      <Stat value={String(inWork)} label="в работе" note="запланировано, разработка, тесты" />
      <Stat mobile={false} value={String(launched.length)} label="запущено" note="навык уже работает" />
      <Stat value={`≈ ${formatHours(saved)} ч`} label="экономии в месяц" note="от запущенных навыков" />
    </div>
  )
}

export function MyRequestsPage() {
  const location = useLocation()
  const submitted = (location.state as { submitted?: boolean } | null)?.submitted === true
  const [pageNo, setPageNo] = useState(0)
  const query = useMyRequests(pageNo)
  const data = query.data
  const hasItems = Boolean(data && data.items.length > 0)

  return (
    <section className="flex flex-col gap-4 min-[768px]:gap-6">
      <header className="flex flex-col gap-4 min-[768px]:flex-row min-[768px]:items-end min-[768px]:justify-between">
        <div className="flex flex-col gap-1 min-[768px]:gap-1.5">
          <h1 className="font-display text-[26px] font-bold tracking-[-0.4px] text-ink min-[768px]:text-[32px] min-[768px]:tracking-[-0.6px]">
            Мои заявки
          </h1>
          <p className="text-[13px] leading-[1.4] text-ink-60 min-[768px]:text-sm min-[768px]:leading-[normal]">
            Статус обновляется сам, когда разработчик двигает навык.
            <span className="hidden min-[768px]:inline"> Об изменениях придёт уведомление.</span>
          </p>
        </div>
        {hasItems ? (
          <Button asChild className="w-full min-[768px]:w-auto">
            <Link to="/ideas/new">
              <PlusIcon />
              Подать идею
            </Link>
          </Button>
        ) : null}
      </header>
      {submitted ? (
        <Alert tone="success" title="Идея отправлена">
          Мы рассмотрим заявку и сообщим о решении.
        </Alert>
      ) : null}
      {data && hasItems ? <Summary items={data.items} total={data.total} /> : null}
      <RequestList
        items={data?.items ?? []}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        total={data?.total}
      />
      {data ? <Pagination page={pageNo} pageSize={data.limit} total={data.total} onPageChange={setPageNo} /> : null}
    </section>
  )
}
