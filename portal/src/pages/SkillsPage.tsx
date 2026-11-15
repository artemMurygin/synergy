import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { SkillsTable } from '@/features/skills'
import type { SkillStatus } from '@/lib/schemas'
import { useSkillCounts, useSkills } from './use-skills'

export function SkillsPage() {
  const [filter, setFilter] = useState<SkillStatus | undefined>()
  const [pageNo, setPageNo] = useState(0)
  const [search, setSearch] = useState('')
  const [product, setProduct] = useState<string | undefined>()
  const query = useSkills(filter, pageNo)
  const counts = useSkillCounts()
  const data = query.data

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[32px] font-bold leading-[41px] tracking-[-0.6px] text-ink">Навыки</h1>
          <p className="text-sm leading-4 text-ink-60">Двигайте статус навыка — привязанные заявки и их авторы обновятся сами.</p>
        </div>
        <label className="flex h-11 w-full items-center gap-2.5 rounded-md border border-border-strong bg-surface px-4 focus-within:ring-2 focus-within:ring-ring min-[640px]:w-[300px]">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px] shrink-0 text-ink-40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            aria-label="Поиск навыка или агента"
            placeholder="Поиск навыка или агента"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent [&::-webkit-search-cancel-button]:hidden font-sans text-[15px] text-ink outline-none placeholder:text-ink-40"
          />
        </label>
      </div>
      {query.isPending ? (
        <p role="status" className="text-sm text-ink-60">
          Загружаем навыки…
        </p>
      ) : query.isError && !data ? (
        <div className="flex flex-col items-start gap-3">
          <Alert title="Не удалось загрузить навыки">{query.error.message}</Alert>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </div>
      ) : (
        <SkillsTable
          items={data?.items ?? []}
          filter={filter}
          counts={counts}
          search={search}
          product={product}
          onProductChange={setProduct}
          onFilterChange={(next) => {
            setFilter(next)
            setPageNo(0)
          }}
          onReset={() => {
            setFilter(undefined)
            setSearch('')
            setProduct(undefined)
            setPageNo(0)
          }}
        />
      )}
      {data ? <Pagination page={pageNo} pageSize={data.limit} total={data.total} onPageChange={setPageNo} /> : null}
    </section>
  )
}
