import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { groupByStatus, RoadmapBoard } from '@/features/catalog'
import { controlClass } from '@/components/ui/form-field'
import { SELECT_CHEVRON_STYLE, selectArrowClass } from '@/components/ui/select'
import type { Catalog } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useCatalog } from './use-catalog'

const ALL = ''

function LoadingState() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Загружаем роадмап…</span>
      <div aria-hidden="true" className="grid grid-cols-1 gap-3 min-[1024px]:grid-cols-5">
        {[3, 2, 3, 2, 3].map((n, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-2.5">
            <div className="h-5 w-20 rounded-pill bg-surface" />
            {Array.from({ length: n }, (_, j) => (
              <div key={j} className="h-14 rounded-md bg-surface" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
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
          <p className="text-[13px] font-semibold text-ink">Не удалось загрузить роадмап</p>
          <p className="text-xs leading-[1.4] text-ink-80">Сервер не ответил. Проверьте соединение и попробуйте ещё раз.</p>
        </div>
      </div>
      <Button variant="outline" className="w-full min-[768px]:w-fit" onClick={onRetry}>
        Повторить
      </Button>
    </div>
  )
}

function ProductFilter({
  products,
  value,
  onChange
}: {
  products: Catalog['products']
  value: string
  onChange: (id: string) => void
}) {
  const options = [{ id: ALL, name: 'Все продукты' }, ...products.map((p) => ({ id: p.id, name: p.name }))]
  return (
    <>
      <div role="group" aria-label="Продукт" className="hidden flex-wrap items-center gap-2 min-[768px]:flex">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'h-9 rounded-pill border px-[18px] text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              value === o.id ? 'border-ink bg-ink text-surface' : 'border-border-strong bg-surface text-ink hover:border-ink'
            )}
          >
            {o.name}
          </button>
        ))}
      </div>
      <select
        aria-label="Продукт"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(controlClass, 'h-12 min-[768px]:hidden', selectArrowClass)}
        style={SELECT_CHEVRON_STYLE}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </>
  )
}

export function RoadmapPage() {
  const query = useCatalog()
  const [productId, setProductId] = useState(ALL)
  const catalog = query.data
  const groups = useMemo(() => (catalog ? groupByStatus(catalog, productId || undefined) : []), [catalog, productId])
  return (
    <section className="flex flex-col gap-4 min-[768px]:gap-6">
      <header className="flex flex-col gap-1 min-[768px]:gap-1.5">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.4px] text-ink min-[768px]:text-[32px] min-[768px]:tracking-[-0.6px]">
          Роадмап
        </h1>
        <p className="text-[13px] leading-[1.4] text-ink-60 min-[768px]:text-sm min-[768px]:leading-[normal]">
          Что команда планирует, делает и уже запустила — по всем агентам Синергии
        </p>
      </header>
      {query.isInitialLoad ? (
        <LoadingState />
      ) : query.error || !catalog ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : (
        <>
          <ProductFilter products={catalog.products} value={productId} onChange={setProductId} />
          <RoadmapBoard groups={groups} />
        </>
      )}
    </section>
  )
}
