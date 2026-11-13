import type { ReactNode } from 'react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ApiError } from '@/lib/errors'
import type { Skill, SkillStatus } from '@/lib/schemas'
import { nextSkillStatus, SKILL_STATUS_FLOW, SKILL_STATUS_LABEL } from '@/lib/status-labels'
import { skillErrorMessage, useChangeSkillStatus } from '../model/use-change-skill-status'

const ACTION_LABEL: Record<Exclude<SkillStatus, 'planned'>, string> = {
  in_dev: 'В разработку',
  testing: 'На тестирование',
  launched: 'Запустить'
}

/* Status / Master colours of the skills screen: background, label and the (separately coloured) dot */
const BADGE_CLASS: Record<SkillStatus, string> = {
  planned: 'bg-surface-sunken text-ink-80 [&>span:first-child]:bg-info',
  in_dev: 'bg-info-soft text-info [&>span:first-child]:bg-info',
  testing: 'bg-info-soft text-info [&>span:first-child]:bg-warning',
  launched: 'bg-success-soft text-success [&>span:first-child]:bg-success'
}

const order = (s: SkillStatus) => SKILL_STATUS_FLOW.indexOf(s)

function ArrowRight() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

export function SkillStatusBadge({ status }: { status: SkillStatus }) {
  return <Badge tone="neutral" className={BADGE_CLASS[status]}>{SKILL_STATUS_LABEL[status]}</Badge>
}

/** The skill's current status (the server state wins whenever it is ahead) and the one allowed next step. */
export function useSkillStatus(skill: Skill) {
  const change = useChangeSkillStatus()
  const changed = change.isSuccess && change.data.id === skill.id ? change.data.status : null
  const status = changed && order(changed) >= order(skill.status) ? changed : skill.status
  return { change, status, next: nextSkillStatus(status) }
}

export type SkillStatusState = ReturnType<typeof useSkillStatus>

/** The action column: the single allowed next step, or the "final status" label for a launched skill. */
export function SkillAction({
  skill,
  state,
  onError
}: {
  skill: Skill
  state: SkillStatusState
  onError?: (error: ApiError) => void
}): ReactNode {
  const { change, next } = state
  if (!next) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] leading-4 text-ink-60">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 text-success" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        Финальный статус
      </span>
    )
  }
  return (
    <Button
      size="sm"
      variant={next === 'launched' ? 'default' : 'outline'}
      disabled={change.isPending}
      onClick={() => change.mutate({ skillId: skill.id, to: next }, { onError })}
    >
      {ACTION_LABEL[next as Exclude<SkillStatus, 'planned'>]}
      <ArrowRight />
    </Button>
  )
}

/** The skill status with the one allowed next step; a conflict shows the message and the server's state. */
export function SkillStatusAction({ skill }: { skill: Skill }) {
  const state = useSkillStatus(skill)
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <SkillStatusBadge status={state.status} />
        <SkillAction skill={skill} state={state} />
      </div>
      {state.change.isError ? <Alert>{skillErrorMessage(state.change.error)}</Alert> : null}
    </div>
  )
}
