import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { BugDetails, BugStatusActions } from '@/features/bugs'
import { useSession } from '@/features/auth'
import { catalogQuery, selectAgent } from '@/features/catalog'
import { CommentsSection } from '@/features/comments'
import { NotFoundView } from './NotFoundView'
import { useBug } from './use-bug'

export function BugPage() {
  const { id = '' } = useParams()
  const { roles } = useSession()
  const query = useBug(id)
  const catalog = useQuery(catalogQuery())

  if (query.notFound) {
    return (
      <NotFoundView
        title="Обращение не найдено"
        text="Ссылка неверная или обращение вам недоступно: его видят только автор и разработчики."
        back={{ to: '/bugs', label: 'Поддержка' }}
      />
    )
  }
  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-ink-60">
        Загружаем обращение…
      </p>
    )
  }
  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert title="Не удалось загрузить обращение">{query.error.message}</Alert>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Повторить
        </Button>
      </div>
    )
  }

  const bug = query.data
  // the catalog hides archived agents; until it is loaded the name stays plain text
  const agentArchived = !catalog.data || !selectAgent(catalog.data, bug.agent.id)
  return (
    <BugDetails
      bug={bug}
      agentArchived={agentArchived}
      actions={roles.includes('developer') ? <BugStatusActions bug={bug} /> : undefined}
      comments={<CommentsSection subject="bugs" subjectId={id} />}
    />
  )
}
