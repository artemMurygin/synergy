import { useState, type FormEvent } from 'react'
import { Link, useInRouterContext } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { IdeaRequest } from '@/lib/schemas'
import { SkillPicker, type SkillPickerErrors, type SkillPickerValue } from '@/features/skills'
import { ApiError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { decisionErrorMessage } from '../model/decision.queries'
import { useAcceptRequest } from '../model/use-accept-request'
import { useRejectRequest } from '../model/use-reject-request'
import type { AcceptTarget } from '../model/decision.api'

type Mode = 'accept' | 'reject'

function toTarget(value: SkillPickerValue): { target: AcceptTarget } | { errors: SkillPickerErrors } {
  if (value.mode === 'existing') {
    return value.skillId ? { target: { skillId: value.skillId } } : { errors: { skillId: 'Выберите навык' } }
  }
  const name = value.name.trim()
  const description = value.description.trim()
  const errors: SkillPickerErrors = {}
  if (!value.agentId) errors.agentId = 'Выберите агента'
  if (!name) errors.name = 'Введите название навыка'
  if (!description) errors.description = 'Опишите навык'
  return Object.keys(errors).length > 0 ? { errors } : { target: { agentId: value.agentId, name, description } }
}

const QUICK_REASONS = ['Уже есть навык', 'Мало эффекта', 'Нельзя автоматизировать']

/* Segment Switch / Master: pill track, active segment is a white pill with a soft shadow */
function SegmentButton({
  active,
  tone,
  onClick,
  children
}: {
  active: boolean
  tone: 'ink' | 'red'
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex-1 whitespace-nowrap rounded-pill px-4 py-1.5 text-center font-sans text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? cn('bg-surface shadow-[0_1px_3px_#0000000f]', tone === 'red' ? 'text-brand-red' : 'text-ink') : 'text-ink-60'
      )}
    >
      {children}
    </button>
  )
}

export interface DecisionPanelProps {
  request: IdeaRequest
  onDecided: (request: IdeaRequest) => void
}

export function DecisionPanel({ request, onDecided }: DecisionPanelProps) {
  const [mode, setMode] = useState<Mode>('accept')
  const [skill, setSkill] = useState<SkillPickerValue>({ mode: 'existing', skillId: '' })
  const [skillErrors, setSkillErrors] = useState<SkillPickerErrors>({})
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const accept = useAcceptRequest()
  const reject = useRejectRequest()
  const active = mode === 'accept' ? accept : reject

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'accept') {
      const result = toTarget(skill)
      if ('errors' in result) {
        setSkillErrors(result.errors)
        return
      }
      setSkillErrors({})
      accept.mutate({ requestId: request.id, target: result.target }, { onSuccess: onDecided })
      return
    }
    const trimmed = reason.trim()
    if (!trimmed) {
      setReasonError('Укажите причину — без неё отклонить нельзя')
      return
    }
    setReasonError(undefined)
    reject.mutate({ requestId: request.id, reason: trimmed }, { onSuccess: onDecided })
  }

  const inRouter = useInRouterContext()
  const conflict = active.error instanceof ApiError && active.error.kind === 'conflict'
  const backClass = 'h-12 px-6'

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      aria-labelledby="decision-title"
      data-testid="decision-panel"
      className="flex flex-col gap-[18px] rounded-lg border border-border bg-surface p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="decision-title" className="font-display text-lg font-bold leading-[1.26] text-ink">
          Решение по заявке
        </h2>
        <p className="font-sans text-xs leading-[1.17] text-ink-60">Автор получит уведомление сразу после решения</p>
      </div>

      {active.isError ? (
        <Alert title={conflict ? 'Решение уже принято' : 'Решение не сохранено'}>
          {decisionErrorMessage(active.error)}
          {conflict ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-1 block text-[13px] font-semibold text-brand-red hover:text-brand-red-hover"
            >
              Обновить страницу
            </button>
          ) : null}
        </Alert>
      ) : null}

      <fieldset disabled={conflict} className={cn('flex min-w-0 flex-col gap-4 border-0 p-0', conflict && 'opacity-45')}>
        <div className="flex gap-0.5 rounded-pill bg-surface-sunken p-[3px]">
          <SegmentButton active={mode === 'accept'} tone="ink" onClick={() => setMode('accept')}>
            Принять в навык
          </SegmentButton>
          <SegmentButton active={mode === 'reject'} tone="red" onClick={() => setMode('reject')}>
            Отклонить
          </SegmentButton>
        </div>

        {mode === 'accept' ? (
          <SkillPicker value={skill} onChange={setSkill} errors={skillErrors} />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="font-sans text-xs font-semibold leading-[1.17] text-ink-60">Частые причины</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_REASONS.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => {
                      setReason(text)
                      setReasonError(undefined)
                    }}
                    className="inline-flex h-8 items-center whitespace-nowrap rounded-pill border border-border-strong bg-surface px-[18px] font-sans text-sm font-medium text-ink transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              label="Причина отказа"
              hint="обязательно, автор её увидит"
              placeholder="Объясните, почему идея не подходит и что можно сделать вместо неё"
              className="h-[110px] min-h-[110px] resize-none text-sm"
              value={reason}
              error={reasonError}
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        )}
      </fieldset>

      <div className={cn('flex gap-2.5', conflict && 'opacity-45')}>
        {inRouter ? (
          <Button asChild variant="outline" className={backClass}>
            <Link to="/queue">В очередь</Link>
          </Button>
        ) : (
          <Button variant="outline" className={backClass}>
            В очередь
          </Button>
        )}
        <Button
          type="submit"
          disabled={active.isPending || conflict}
          className={cn('flex-1', conflict && 'disabled:opacity-100', mode === 'reject' && 'bg-ink !shadow-none hover:bg-ink-80')}
        >
          {mode === 'accept' ? (skill.mode === 'new' ? 'Создать навык и принять' : 'Принять заявку') : 'Отклонить заявку'}
        </Button>
      </div>
    </form>
  )
}
