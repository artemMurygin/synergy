import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { ApiError } from '@/lib/errors'
import type { IdeaRequest } from '@/lib/schemas'
import { useTakeRequest } from '../model/use-take-request'

export interface TakeRequestActionProps {
  request: IdeaRequest
  onTaken: (request: IdeaRequest) => void
  /** The request was taken or decided by someone else first; the caller keeps the notice when this panel goes away. */
  onConflict?: (error: ApiError) => void
}

function UserCheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 11 2 2 4-4" />
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0 text-ink-40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

/* Take Panel (Fr8BO / f6EG4): title and caption, full-width red button, info hint */
export function TakeRequestAction({ request, onTaken, onConflict }: TakeRequestActionProps) {
  const take = useTakeRequest()

  function handleTake() {
    take.mutate(request.id, {
      onSuccess: onTaken,
      onError: (error) => {
        if (error.kind === 'conflict') onConflict?.(error)
      }
    })
  }

  return (
    <section aria-labelledby="take-title" className="flex flex-col gap-[18px] rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 id="take-title" className="font-display text-lg font-bold leading-[1.26] text-ink">
          Заявка ещё не в работе
        </h2>
        <p className="font-sans text-xs leading-[1.4] text-ink-60">
          Возьмите заявку, чтобы оценить её и принять решение. Автор увидит статус «На рассмотрении» и ваше имя
        </p>
      </div>
      {take.isError ? <Alert>{take.error.message}</Alert> : null}
      <Button className="w-full" disabled={take.isPending} onClick={handleTake}>
        <UserCheckIcon />
        {take.isPending ? 'Берём в работу…' : 'Взять в работу'}
      </Button>
      <div className="flex items-center gap-2">
        <InfoIcon />
        <p className="flex-1 font-sans text-xs text-ink-60">Решение сможет принять любой разработчик</p>
      </div>
    </section>
  )
}
