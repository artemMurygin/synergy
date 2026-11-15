import { Button } from '@/components/ui/button'
import { CatalogList } from '@/features/catalog'
import { useCatalog } from './use-catalog'

function LoadingState() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Загружаем каталог…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-3.5">
            <div className="h-7 w-[220px] rounded-sm bg-surface-sunken" />
            <div className="grid grid-cols-1 gap-3 min-[768px]:grid-cols-2 min-[768px]:gap-4 min-[1024px]:grid-cols-3">
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-[120px] rounded-lg border border-border bg-surface" />
              ))}
            </div>
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
          <p className="text-[13px] font-semibold text-ink">Не удалось загрузить каталог</p>
          <p className="text-xs leading-[1.4] text-ink-80">Сервер не ответил. Проверьте соединение и попробуйте ещё раз.</p>
        </div>
      </div>
      <Button variant="outline" className="w-full min-[768px]:w-fit" onClick={onRetry}>
        Повторить
      </Button>
    </div>
  )
}

export function CatalogPage() {
  const query = useCatalog()
  return (
    <section className="flex flex-col gap-4 min-[768px]:gap-6">
      <header className="flex flex-col gap-1 min-[768px]:gap-1.5">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.4px] text-ink min-[768px]:text-[32px] min-[768px]:tracking-[-0.6px]">
          Каталог
        </h1>
        <p className="text-[13px] leading-[1.4] text-ink-60 min-[768px]:text-sm min-[768px]:leading-[normal]">
          Продукты Синергии и их ИИ-агенты: что уже работает и что в разработке
        </p>
      </header>
      {query.isInitialLoad ? (
        <LoadingState />
      ) : query.error || !query.data ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : (
        <CatalogList products={query.data.products} />
      )}
    </section>
  )
}
