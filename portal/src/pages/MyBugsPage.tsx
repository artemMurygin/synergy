import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { BugList } from '@/features/bugs'
import { BUGS_PAGE_SIZE } from '@/features/bugs/model/bugs.api'
import { useMyBugs } from './use-my-bugs'

function ReportButton({ className }: { className?: string }) {
  return (
    <Button asChild className={className}>
      <Link to="/bugs/new">
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
        Сообщить о проблеме
      </Link>
    </Button>
  )
}

function EmptyState() {
  return (
    <div className="flex justify-center rounded-lg border border-border bg-surface px-5 py-8 min-[768px]:px-6 min-[768px]:py-14">
      <div className="flex w-full max-w-[460px] flex-col items-center gap-3 text-center min-[768px]:gap-3.5">
        <div className="flex size-14 items-center justify-center rounded-pill bg-surface-sunken text-ink-60 min-[768px]:size-16">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6 min-[768px]:size-7"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m4.93 4.93 4.24 4.24" />
            <path d="m14.83 9.17 4.24-4.24" />
            <path d="m14.83 14.83 4.24 4.24" />
            <path d="m9.17 14.83-4.24 4.24" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </div>
        <p className="font-display text-[22px] font-bold text-ink min-[768px]:text-[26px]">Обращений пока нет</p>
        <p className="text-[13px] leading-[1.45] text-ink-60 min-[768px]:text-sm">
          Если агент ответил неверно или перестал работать, расскажите об этом. Разработчики разберутся и ответят здесь же.
        </p>
        <ReportButton className="w-full min-[768px]:w-auto" />
      </div>
    </div>
  )
}

export function MyBugsPage() {
  const [pageNo, setPageNo] = useState(0)
  const query = useMyBugs(pageNo)
  const data = query.data
  const hasItems = Boolean(data && data.items.length > 0)

  return (
    <section className="flex flex-col gap-4 min-[768px]:gap-6">
      <header className="flex flex-col gap-4 min-[768px]:flex-row min-[768px]:items-end min-[768px]:justify-between min-[768px]:gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[26px] font-bold tracking-[-0.4px] text-ink min-[768px]:text-[32px] min-[768px]:tracking-[-0.6px]">
            Поддержка
          </h1>
          <p className="text-[13px] leading-[1.4] text-ink-60 min-[768px]:text-sm min-[768px]:leading-[normal]">
            Ваши обращения о проблемах с агентами. Когда разработчик сменит статус, придёт уведомление.
          </p>
        </div>
        {hasItems ? <ReportButton className="w-full min-[768px]:w-auto" /> : null}
      </header>
      <BugList
        items={data?.items ?? []}
        total={data?.total ?? 0}
        page={pageNo}
        pageSize={data?.limit ?? BUGS_PAGE_SIZE}
        onPageChange={setPageNo}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={<EmptyState />}
      />
    </section>
  )
}
