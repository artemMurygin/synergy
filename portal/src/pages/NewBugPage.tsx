import { Link, useNavigate, useSearchParams } from 'react-router'
import { BugForm } from '@/features/bugs'
import { useCatalog } from './use-catalog'

function BackLink({ agentId, name }: { agentId: string; name: string }) {
  return (
    <Link to={`/catalog/agents/${encodeURIComponent(agentId)}`} className="flex h-11 w-fit items-center gap-1.5 text-sm font-semibold text-ink-60 hover:text-ink min-[768px]:h-auto">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
      {name}
    </Link>
  )
}

export function NewBugPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const agentId = params.get('agentId') ?? undefined
  const catalog = useCatalog()
  const products = catalog.data?.products
  const agentName = agentId ? products?.flatMap((p) => p.agents).find((a) => a.id === agentId)?.name : undefined
  const fromAgent = Boolean(agentId && agentName)

  return (
    <section className="flex flex-col gap-4 min-[1024px]:gap-6">
      {agentId && agentName ? <BackLink agentId={agentId} name={agentName} /> : null}
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.4px] text-ink min-[640px]:text-[28px] min-[1024px]:text-[32px] min-[1024px]:tracking-[-0.6px]">
          Сообщить о проблеме
        </h1>
        <p className="text-[13px] leading-[1.4] text-ink-60 min-[1024px]:text-sm">
          {fromAgent
            ? 'Агент выбран из карточки. Опишите, что пошло не так: разработчики увидят обращение и ответят в комментариях.'
            : 'Расскажите, что пошло не так в работе агента. Разработчики увидят обращение и ответят в комментариях.'}
        </p>
      </header>
      {products ? (
        <BugForm
          products={products}
          initialAgentId={agentId}
          onReported={(id) => void navigate(`/bugs/${encodeURIComponent(id)}`)}
          onCancel={() => void navigate(-1)}
        />
      ) : catalog.isError ? (
        <div role="alert" className="rounded-md bg-brand-red-soft px-3.5 py-3 text-[13px] font-semibold text-ink">
          Не удалось загрузить каталог
          <button type="button" onClick={() => void catalog.refetch()} className="ml-3 font-semibold text-brand-red">
            Повторить
          </button>
        </div>
      ) : (
        <div role="status" aria-label="Загрузка" className="h-[320px] rounded-lg border border-border bg-surface" />
      )}
    </section>
  )
}
