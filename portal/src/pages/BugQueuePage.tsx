import { useState } from 'react'
import { BugList, BugQueueFilter, BUGS_PAGE_SIZE, type BugQueueFilterValue } from '@/features/bugs'
import { useBugQueue } from './use-bug-queue'

const EMPTY_TEXT: Record<BugQueueFilterValue, { title: string; hint: string }> = {
  unclosed: { title: 'Незакрытых багов нет', hint: 'Новые обращения появятся здесь. Выберите другой статус, чтобы увидеть остальные.' },
  open: { title: 'Открытых багов нет', hint: 'Новые обращения появятся здесь. Выберите другой статус, чтобы увидеть остальные.' },
  in_progress: { title: 'Багов в работе нет', hint: 'Здесь появятся баги, которые взяли в работу. Выберите другой статус, чтобы увидеть остальные.' },
  resolved: { title: 'Исправленных багов нет', hint: 'Здесь появятся баги, которые отметят исправленными. Выберите другой статус, чтобы увидеть остальные.' },
  wont_fix: { title: 'Закрытых без исправления багов нет', hint: 'Здесь появятся баги со статусом «Не будет исправлен». Выберите другой статус, чтобы увидеть остальные.' }
}

function EmptyState({ filter }: { filter: BugQueueFilterValue }) {
  const { title, hint } = EMPTY_TEXT[filter]
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
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        </div>
        <p className="font-display text-[22px] font-bold text-ink min-[768px]:text-[26px]">{title}</p>
        <p className="text-[13px] leading-[1.45] text-ink-60 min-[768px]:text-sm">{hint}</p>
      </div>
    </div>
  )
}

export function BugQueuePage() {
  const [filter, setFilter] = useState<BugQueueFilterValue>('unclosed')
  const [pageNo, setPageNo] = useState(0)
  const query = useBugQueue(filter, pageNo)
  const data = query.data

  const changeFilter = (next: BugQueueFilterValue) => {
    setFilter(next)
    setPageNo(0)
  }

  return (
    <section className="flex flex-col gap-4 min-[768px]:gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.4px] text-ink min-[768px]:text-[32px] min-[768px]:tracking-[-0.6px]">
          Баги
        </h1>
        <p className="text-[13px] leading-[1.4] text-ink-60 min-[768px]:text-sm min-[768px]:leading-[normal]">
          Обращения сотрудников о проблемах с агентами. Сначала открытые, внутри статуса — от старых к новым.
        </p>
      </header>
      <BugQueueFilter value={filter} onChange={changeFilter} />
      <BugList
        showAuthor
        items={data?.items ?? []}
        total={data?.total ?? 0}
        page={pageNo}
        pageSize={data?.limit ?? BUGS_PAGE_SIZE}
        onPageChange={setPageNo}
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={<EmptyState filter={filter} />}
      />
    </section>
  )
}
