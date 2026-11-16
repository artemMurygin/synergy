import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { bugErrorMessage, BUG_INVALID_TRANSITION_MESSAGE } from '../model/bugs.errors'
import type { Bug, BugStatus } from '../model/bugs.schema'
import { useChangeBugStatus } from '../model/use-change-bug-status'
import { WontFixDialog } from './WontFixDialog'

const ORDER: readonly BugStatus[] = ['in_progress', 'resolved', 'wont_fix', 'open']

function buttonFor(target: BugStatus, current: BugStatus): { label: string; variant: 'default' | 'outline' | 'ghost' } {
  switch (target) {
    case 'in_progress':
      return { label: current === 'open' ? 'Взять в работу' : 'Переоткрыть', variant: current === 'open' ? 'default' : 'outline' }
    case 'resolved':
      return { label: 'Исправлен', variant: 'default' }
    case 'wont_fix':
      return { label: 'Не будет исправлен', variant: 'outline' }
    case 'open':
      return { label: 'Вернуть в очередь', variant: 'ghost' }
  }
}

const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

function note(bug: Bug): string {
  const when = date(bug.statusChangedAt)
  switch (bug.status) {
    case 'open':
      return `Обращение ждёт разработчика с ${when}.`
    case 'in_progress':
      return `Обращение в работе с ${when}. Автор получит уведомление о смене статуса.`
    default:
      return bug.statusChangedBy ? `Статус изменил ${bug.statusChangedBy.fullName} ${when}.` : `Статус изменён ${when}.`
  }
}

/* Bug Status Actions (BvkYa): card with title, note and full-width buttons by nextStatuses; shown to developers only (by the page). */
export function BugStatusActions({ bug }: { bug: Bug }) {
  const change = useChangeBugStatus(bug.id)
  const [dialogOpen, setDialogOpen] = useState(false)
  const targets = ORDER.filter((status) => bug.nextStatuses.includes(status))
  if (targets.length === 0) return null

  const conflict = change.error?.kind === 'conflict'

  function send(status: BugStatus, reason?: string) {
    change.mutate(reason === undefined ? { status } : { status, reason }, { onSettled: () => setDialogOpen(false) })
  }

  return (
    <section aria-labelledby="bug-status-title" className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-6">
      <h2 id="bug-status-title" className="text-[13px] font-bold leading-[15px] text-ink">
        Статус
      </h2>
      {change.isError ? (
        <Alert tone={conflict ? 'warning' : 'error'} title={conflict ? BUG_INVALID_TRANSITION_MESSAGE : bugErrorMessage(change.error)}>
          {conflict ? 'Показываем актуальный статус.' : undefined}
        </Alert>
      ) : null}
      <p className="text-[13px] leading-[1.45] text-ink-60">{note(bug)}</p>
      <div className="flex flex-col gap-2.5">
        {targets.map((status) => {
          const { label, variant } = buttonFor(status, bug.status)
          return (
            <Button
              key={status}
              variant={variant}
              className="w-full"
              disabled={change.isPending}
              onClick={() => (status === 'wont_fix' ? setDialogOpen(true) : send(status))}
            >
              {label}
            </Button>
          )
        })}
      </div>
      <WontFixDialog open={dialogOpen} pending={change.isPending} onClose={() => setDialogOpen(false)} onConfirm={(reason) => send('wont_fix', reason)} />
    </section>
  )
}
