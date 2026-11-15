import { useState, type FormEvent } from 'react'
import { Link, useInRouterContext } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PersonAvatar } from '@/components/ui/person-avatar'
import type { IdeaRequest, ProductRef } from '@/lib/schemas'
import { SkillPicker, type SkillPickerErrors, type SkillPickerValue } from '@/features/skills'
import { ApiError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { isArchiveConflict, isNameConflict } from '../model/decision-cache'
import { AGENT_NAME_TAKEN_MESSAGE, decisionErrorMessage } from '../model/decision.queries'
import { useAcceptRequest } from '../model/use-accept-request'
import { useRejectRequest } from '../model/use-reject-request'
import type { AcceptTarget } from '../model/decision.api'
import { EffortField } from './EffortField'

type Mode = 'accept' | 'reject'

const MAX_EFFORT_HOURS = 2000
const NAME_TAKEN = 'Название занято'

function parseEffort(text: string): { effortHours: number } | { error: string } {
  const trimmed = text.trim()
  const hours = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_EFFORT_HOURS) {
    return { error: `Укажите целое число часов от 1 до ${String(MAX_EFFORT_HOURS)}` }
  }
  return { effortHours: hours }
}

function toTarget(value: SkillPickerValue): { target: AcceptTarget } | { errors: SkillPickerErrors } {
  if (value.mode === 'existing') {
    return value.skillId
      ? { target: { kind: 'existing_skill', skillId: value.skillId } }
      : { errors: { skillId: 'Выберите навык' } }
  }
  const name = value.name.trim()
  const description = value.description.trim()
  const errors: SkillPickerErrors = {}
  if (value.mode === 'new') {
    if (!value.agentId) errors.agentId = 'Выберите агента'
  } else {
    if (!value.agentName.trim()) errors.agentName = 'Введите название агента'
    if (value.productIds.length === 0 && !value.newProductName.trim()) errors.products = 'Выберите хотя бы один продукт'
  }
  if (!name) errors.name = 'Введите название навыка'
  if (!description) errors.description = 'Опишите навык'
  if (Object.keys(errors).length > 0) return { errors }
  if (value.mode === 'new') return { target: { kind: 'new_skill', agentId: value.agentId, name, description } }
  const newProduct = value.newProductName.trim()
  return {
    target: {
      kind: 'new_agent',
      agent: {
        name: value.agentName.trim(),
        productIds: value.productIds,
        ...(newProduct ? { newProduct: { name: newProduct } } : {})
      },
      skill: { name, description }
    }
  }
}

function nameTakenErrors(error: unknown): SkillPickerErrors {
  if (!(error instanceof ApiError)) return {}
  if (error.code === 'PORTAL_AGENT_NAME_TAKEN') return { agentName: NAME_TAKEN }
  if (error.code === 'PORTAL_PRODUCT_NAME_TAKEN') return { newProduct: NAME_TAKEN }
  return {}
}

function submitLabel(skill: SkillPickerValue): string {
  if (skill.mode === 'new_agent') return 'Создать и принять'
  return skill.mode === 'new' ? 'Создать навык и принять' : 'Принять заявку'
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
  /** Products of the catalog for the «new agent» form (used by the new-agent mode). */
  products?: ProductRef[]
}

export function DecisionPanel({ request, products = [], onDecided }: DecisionPanelProps) {
  const [mode, setMode] = useState<Mode>('accept')
  const [skill, setSkill] = useState<SkillPickerValue>({ mode: 'existing', skillId: '' })
  const [skillErrors, setSkillErrors] = useState<SkillPickerErrors>({})
  const [effort, setEffort] = useState('')
  const [effortError, setEffortError] = useState<string | undefined>()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const accept = useAcceptRequest()
  const reject = useRejectRequest()
  const active = mode === 'accept' ? accept : reject

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'accept') {
      const parsed = parseEffort(effort)
      const result = toTarget(skill)
      setEffortError('error' in parsed ? parsed.error : undefined)
      setSkillErrors('errors' in result ? result.errors : {})
      if ('error' in parsed || 'errors' in result) return
      accept.mutate(
        { requestId: request.id, effortHours: parsed.effortHours, target: result.target },
        { onSuccess: onDecided }
      )
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
  const conflict =
    active.error instanceof ApiError &&
    active.error.kind === 'conflict' &&
    !isNameConflict(active.error) &&
    !isArchiveConflict(active.error)
  const agentNameTaken =
    mode === 'accept' && accept.error instanceof ApiError && accept.error.code === 'PORTAL_AGENT_NAME_TAKEN' && skill.mode === 'new_agent'
  const pickerErrors = mode === 'accept' ? { ...skillErrors, ...nameTakenErrors(accept.error) } : skillErrors
  const takenAt = request.takenAt ? new Date(request.takenAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : null
  const backClass = 'h-12 px-6 max-sm:order-last'

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
        {request.reviewer && takenAt ? (
          <div className="flex items-center gap-2 pt-1">
            <PersonAvatar fullName={request.reviewer.fullName} className="size-6 text-[10px]" />
            <p className="font-sans text-xs leading-[1.17] text-ink-60">
              В работе у {request.reviewer.fullName} · с {takenAt}
            </p>
          </div>
        ) : null}
      </div>

      {active.isError ? (
        <Alert title={conflict ? 'Решение уже принято' : agentNameTaken ? AGENT_NAME_TAKEN_MESSAGE : 'Решение не сохранено'}>
          {agentNameTaken && skill.mode === 'new_agent'
            ? `«${skill.agentName.trim()}» уже есть в каталоге. Выберите его в режиме «Новый навык» или задайте другое название. Введённые данные сохранены.`
            : decisionErrorMessage(active.error)}
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
          <>
            <EffortField value={effort} onChange={setEffort} error={effortError} />
            <SkillPicker value={skill} onChange={setSkill} errors={pickerErrors} products={products} />
          </>
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

      <div className={cn('flex flex-col gap-2 sm:flex-row sm:gap-2.5', conflict && 'opacity-45')}>
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
          className={cn('sm:flex-1', conflict && 'disabled:opacity-100', mode === 'reject' && 'bg-ink !shadow-none hover:bg-ink-80')}
        >
          {mode === 'accept' ? submitLabel(skill) : 'Отклонить заявку'}
        </Button>
      </div>
    </form>
  )
}
