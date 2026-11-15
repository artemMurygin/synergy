import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useSession } from '@/features/auth'
import { catalogQuery } from '@/features/catalog'
import { CommentsSection } from '@/features/comments'
import { DecisionPanel, TakeRequestAction } from '@/features/decision'
import { RequestDetails } from '@/features/requests'
import { NotFoundView } from './NotFoundView'
import { useRequest } from './use-request'

export function RequestPage() {
  const { id = '' } = useParams()
  const { roles } = useSession()
  const query = useRequest(id)
  const isDeveloper = roles.includes('developer')
  const catalog = useQuery({ ...catalogQuery(), enabled: isDeveloper })
  const [conflict, setConflict] = useState(false)

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
  const reviewerName = request.reviewer ? request.reviewer.fullName : null
  let decision: ReactNode
  if (isDeveloper && request.status.code === 'new') {
    decision = <TakeRequestAction request={request} onTaken={() => setConflict(false)} onConflict={() => setConflict(true)} />
  } else if (isDeveloper && request.status.code === 'under_review') {
    decision = (
      <div className="flex flex-col gap-3.5">
        {conflict ? (
          <Alert title="Заявку уже взяли в работу">
            {reviewerName ? `${reviewerName} взял(а) её в работу. ` : ''}Решение может принять любой разработчик.
          </Alert>
        ) : null}
        <DecisionPanel request={request} products={catalog.data?.products} onDecided={() => void query.refetch()} />
      </div>
    )
  } else if (conflict) {
    decision = <Alert title="Не удалось взять заявку в работу">По заявке уже принято решение.</Alert>
  }
  return <RequestDetails request={request} decision={decision} comments={<CommentsSection requestId={id} />} />
}
