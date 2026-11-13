import { useParams } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useSession } from '@/features/auth'
import { DecisionPanel } from '@/features/decision'
import { RequestDetails } from '@/features/requests'
import { NotFoundView } from './NotFoundView'
import { useRequest } from './use-request'

export function RequestPage() {
  const { id = '' } = useParams()
  const { roles } = useSession()
  const query = useRequest(id)

  if (query.notFound) {
    return <NotFoundView title="Заявка не найдена" text="Ссылка могла устареть, или заявка принадлежит другому сотруднику. Проверьте адрес или вернитесь к списку." />
  }
  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-ink-60">
        Загружаем заявку…
      </p>
    )
  }
  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert title="Не удалось загрузить заявку">{query.error.message}</Alert>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Повторить
        </Button>
      </div>
    )
  }

  const request = query.data
  const canDecide = roles.includes('developer') && request.status.code === 'pending'
  return (
    <RequestDetails
      request={request}
      decision={canDecide ? <DecisionPanel request={request} onDecided={() => void query.refetch()} /> : undefined}
    />
  )
}
