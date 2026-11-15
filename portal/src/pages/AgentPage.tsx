import { Link, useNavigate, useParams } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AgentCard, ArchiveAgentAction, selectAgent } from '@/features/catalog'
import { NotFoundView } from './NotFoundView'
import { useCatalog } from './use-catalog'

function BackLink() {
  return (
    <Link to="/catalog" className="flex h-11 w-fit items-center gap-1.5 text-sm font-semibold text-ink-60 hover:text-ink min-[768px]:h-auto">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
      Каталог
    </Link>
  )
}

function ReportBugLink({ agentId }: { agentId: string }) {
  return (
    <Button asChild variant="outline" className="h-11 w-full min-[768px]:w-auto">
      <Link to={`/bugs/new?agentId=${encodeURIComponent(agentId)}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
          <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
          <path d="M12 15h.01" />
          <path d="M12 7v4" />
        </svg>
        Сообщить о проблеме
      </Link>
    </Button>
  )
}

function LoadingState() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Загружаем агента…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-[123px] rounded-lg border border-border bg-surface" />
        <div className="h-[200px] rounded-lg border border-border bg-surface" />
      </div>
    </div>
  )
}

export function AgentPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const query = useCatalog()
  const agent = query.data ? selectAgent(query.data, id) : undefined

  if (query.isInitialLoad) {
    return (
      <section className="flex flex-col gap-4 min-[768px]:gap-6">
        <BackLink />
        <LoadingState />
      </section>
    )
  }
  if (query.error || !query.data) {
    return (
      <section className="flex flex-col gap-4 min-[768px]:gap-6">
        <BackLink />
        <Alert title="Не удалось загрузить агента">Сервер не ответил. Проверьте соединение и попробуйте ещё раз.</Alert>
        <Button variant="outline" className="w-full min-[768px]:w-fit" onClick={() => void query.refetch()}>
          Повторить
        </Button>
      </section>
    )
  }
  if (!agent) {
    return (
      <NotFoundView
        title="Агент не найден"
        text="Его могли перенести в архив, или ссылка устарела. Остальные агенты — в каталоге"
        back={{ to: '/catalog', label: 'К каталогу' }}
      />
    )
  }
  return (
    <section className="flex flex-col gap-4 min-[768px]:gap-6">
      <BackLink />
      <AgentCard
        agent={agent}
        actions={
          <div className="flex flex-col gap-3 min-[768px]:flex-row min-[768px]:items-center">
            <ReportBugLink agentId={agent.id} />
            <ArchiveAgentAction
              agentId={agent.id}
              agentName={agent.name}
              products={agent.products}
              skillsCount={agent.skills.length}
              onArchived={() => void navigate('/catalog')}
            />
          </div>
        }
      />
    </section>
  )
}
