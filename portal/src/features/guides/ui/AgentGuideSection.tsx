import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { agentGuideQuery } from '../model/guides.queries'
import { GuideEditor } from './GuideEditor'
import { GuideView } from './GuideView'

const SVG = { 'aria-hidden': true, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Skeleton() {
  const widths = ['w-[220px] h-[22px]', 'w-[700px]', 'w-[620px]', 'w-[520px]', 'w-[580px]', 'w-[300px]']
  return (
    <div role="status" aria-label="Загружаем инструкцию…" className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface px-4 py-5 min-[768px]:px-8 min-[768px]:py-7">
      {widths.map((w, i) => (
        <div key={i} aria-hidden="true" className={`h-3.5 max-w-full rounded-sm bg-surface-sunken ${w}`} />
      ))}
    </div>
  )
}

function Empty({ canEdit, onWrite }: { canEdit: boolean; onWrite: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 min-[768px]:flex-row min-[768px]:items-center min-[768px]:gap-5 min-[768px]:px-7 min-[768px]:py-6">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-60">
        <svg {...SVG} className="size-[22px]">
          <path d="M12 7v14" />
          <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
        </svg>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-display text-[17px] font-bold text-ink">Инструкции пока нет</p>
        <p className="text-sm text-ink-60">
          {canEdit
            ? 'Расскажите сотрудникам, как начать работу с агентом: шаги, команды, примеры запросов. Поддерживается markdown'
            : 'Разработчики ещё не описали, как работать с агентом. Навыки агента — ниже'}
        </p>
      </div>
      {canEdit ? (
        <Button className="h-11 w-full min-[768px]:w-auto" onClick={onWrite}>
          Написать инструкцию
        </Button>
      ) : null}
    </div>
  )
}

/** Block «Инструкция» of the agent card: view, empty state, loading and error never hide the rest of the card. */
export function AgentGuideSection({ agentId, canEdit }: { agentId: string; canEdit: boolean }) {
  const query = useQuery(agentGuideQuery(agentId))
  const [editing, setEditing] = useState(false)
  const guide = query.data
  const showEdit = canEdit && !editing && guide?.body != null

  let content
  if (guide) {
    if (editing) content = <GuideEditor initialBody={guide.body ?? ''} agentId={agentId} onDone={() => setEditing(false)} />
    else if (guide.body == null) content = <Empty canEdit={canEdit} onWrite={() => setEditing(true)} />
    else content = <GuideView guide={guide} />
  } else if (query.isError) {
    content = (
      <Alert title="Не удалось загрузить инструкцию">
        <div className="flex flex-col items-start gap-2">
          <p>Проверьте соединение и попробуйте ещё раз. Навыки агента показаны ниже</p>
          <Button variant="outline" size="sm" className="h-8 px-3 text-[13px]" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </div>
      </Alert>
    )
  } else {
    content = <Skeleton />
  }

  return (
    <section aria-label="Инструкция" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-ink">Инструкция</h2>
        {showEdit ? (
          <Button variant="outline" size="sm" className="px-3.5" onClick={() => setEditing(true)}>
            Изменить
          </Button>
        ) : null}
      </div>
      {content}
    </section>
  )
}
