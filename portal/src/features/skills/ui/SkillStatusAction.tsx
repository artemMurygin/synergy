import type { ReactNode } from 'react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ApiError } from '@/lib/errors'
import type { Skill, SkillStatus } from '@/lib/schemas'
import { SKILL_BADGE_CLASS, SKILL_STATUS_LABEL } from '@/lib/status-labels'
import { skillErrorMessage, useChangeSkillStatus } from '../model/use-change-skill-status'

/* The transition buttons are named by the target status; "rework" always comes first, as in the design */
const ACTION_LABEL: Record<SkillStatus, string> = {
  planned: 'Запланировано',
  in_dev: 'В разработку',
  testing: 'На тестирование',
  launched: 'Запустить',
  rework: 'На доработку'
}

const time = (iso: string) => new Date(iso).getTime()

function Undo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

export function SkillStatusBadge({ status }: { status: SkillStatus }) {
  return <Badge tone="neutral" className={SKILL_BADGE_CLASS[status]}>{SKILL_STATUS_LABEL[status]}</Badge>
}

/** The skill as the user should see it: the server answer of this session counts only if it is not older than the list. */
export function useSkillStatus(skill: Skill) {
  const change = useChangeSkillStatus()
  const answer = change.isSuccess && change.data.id === skill.id ? change.data : null
  const actual = answer && time(answer.statusChangedAt) >= time(skill.statusChangedAt) ? answer : skill
  const next = [...actual.nextStatuses].sort((a, b) => Number(b === 'rework') - Number(a === 'rework'))
  return { change, status: actual.status, next }
}

export type SkillStatusState = ReturnType<typeof useSkillStatus>

/** The action column: one button per status from `nextStatuses`; nothing when no transition is allowed. */
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
  if (next.length === 0) return null
  return (
    <div className="flex flex-col items-stretch gap-2 min-[900px]:flex-row min-[900px]:items-center">
      {next.map((to) => (
        <Button
          key={to}
          size="sm"
          variant={to === 'launched' ? 'default' : 'outline'}
          className="h-11 min-[900px]:h-9"
          disabled={change.isPending}
          onClick={() => change.mutate({ skillId: skill.id, to }, { onError })}
        >
          {ACTION_LABEL[to]}
          {to === 'rework' ? <Undo /> : <ArrowRight />}
        </Button>
      ))}
    </div>
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
