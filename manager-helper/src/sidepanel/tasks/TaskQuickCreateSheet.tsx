import { Button, Input, Sheet, SheetContent, Textarea, UserPicker } from '@synergy/ui-kit'
import { ChevronDown, ChevronUp } from '@synergy/ui-kit/icons'
import { useRef, useState } from 'react'
import type { UserSummary } from '@/shared/tasks-api'
import { AssigneeSheet } from './AssigneeSheet'
import { DeadlineSheet } from './DeadlineSheet'
import { useTaskCreateForm } from './use-task-create-form'
import { useUserSearch } from './use-user-search'
import { formatDeadlineChip, isSameDay, quickDeadlineIso } from './quick-deadline'

interface Props {
  me: UserSummary
  onCreated: () => void
  onCancel: () => void
}

type View = 'form' | 'deadline' | 'assignee'

const chip =
  'inline-flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40'
const chipOff = `${chip} bg-surface-alt text-ink-80 hover:bg-surface-sunken`
const chipOn = `${chip} bg-brand-red-soft text-brand-red`

/**
 * Quick task create on mobile: a bottom sheet with a grabber, the title field ("Enter — создать"),
 * the deadline and assignee chips and a collapsible "Описание и наблюдатели" (ZzHmH). "Дата…"
 * and "Выбрать…" switch the sheet to the nested "Дедлайн" / "Ответственный" views; the form state
 * lives here, so "Назад" loses nothing.
 */
export function TaskQuickCreateSheet({ me, onCreated, onCancel }: Props) {
  const userSearch = useUserSearch()
  const state = useTaskCreateForm(me, onCreated)
  const { value, setValue } = state
  const [view, setView] = useState<View>('form')
  const [more, setMore] = useState(false)
  const title = useRef<HTMLInputElement>(null)
  const now = new Date()

  const deadline = value.deadline === null ? null : new Date(value.deadline)
  const today = deadline !== null && isSameDay(deadline, now)
  const tomorrow = deadline !== null && isSameDay(deadline, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const custom = deadline !== null && !today && !tomorrow
  const assigneeIsMe = value.assignee?.id === me.id
  const assigneeChosen = value.assignee !== null && !assigneeIsMe

  const body =
    view === 'deadline' ? (
      <DeadlineSheet
        value={deadline}
        onChange={(date) => {
          setValue({ ...value, deadline: date === null ? null : date.toISOString() })
        }}
        onBack={() => {
          setView('form')
        }}
      />
    ) : view === 'assignee' ? (
      <AssigneeSheet
        value={value.assignee}
        me={me}
        search={userSearch}
        onPick={(user) => {
          setValue({ ...value, assignee: user })
          setView('form')
        }}
        onBack={() => {
          setView('form')
        }}
      />
    ) : (
      <>
        {state.message !== null && (
          <p role="alert" className="rounded-md bg-brand-red-soft px-3 py-2 text-[13px] text-brand-red">
            {state.message} Введённые данные сохранены.
          </p>
        )}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 focus-within:ring-2 focus-within:ring-brand-red/30">
            <Input
              ref={title}
              aria-label="Название"
              placeholder="Что нужно сделать?"
              value={value.title}
              error={state.errors.title}
              className="h-14 border-0 bg-transparent px-0 focus-visible:ring-0"
              onChange={(event) => {
                setValue({ ...value, title: event.target.value })
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void state.submit()
                }
              }}
            />
            <span className="shrink-0 text-[11px] text-ink-40">Enter — создать</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-80">Дедлайн</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={today}
              className={today ? chipOn : chipOff}
              onClick={() => {
                setValue({ ...value, deadline: quickDeadlineIso('today', now, deadline) })
              }}
            >
              Сегодня
            </button>
            <button
              type="button"
              aria-pressed={tomorrow}
              className={tomorrow ? chipOn : chipOff}
              onClick={() => {
                setValue({ ...value, deadline: quickDeadlineIso('tomorrow', now, deadline) })
              }}
            >
              Завтра
            </button>
            <button
              type="button"
              aria-pressed={custom}
              className={custom ? chipOn : chipOff}
              onClick={() => {
                setView('deadline')
              }}
            >
              {custom ? formatDeadlineChip(deadline) : 'Дата…'}
            </button>
            <button
              type="button"
              aria-pressed={deadline === null}
              className={deadline === null ? chipOn : chipOff}
              onClick={() => {
                setValue({ ...value, deadline: null })
              }}
            >
              Без срока
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-80">Ответственный</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={assigneeIsMe}
              className={assigneeIsMe ? chipOn : chipOff}
              onClick={() => {
                setValue({ ...value, assignee: me })
              }}
            >
              Я · {me.login}
            </button>
            <button
              type="button"
              aria-pressed={assigneeChosen}
              className={assigneeChosen ? chipOn : chipOff}
              onClick={() => {
                setView('assignee')
              }}
            >
              {assigneeChosen ? value.assignee?.login : 'Выбрать…'}
            </button>
          </div>
          {state.errors.assignee ? <p className="text-xs text-brand-red">{state.errors.assignee}</p> : null}
        </div>
        <button
          type="button"
          aria-expanded={more}
          onClick={() => {
            setMore((open) => !open)
          }}
          className="flex h-10 items-center justify-between rounded-xl px-1 text-[13px] font-semibold text-ink-60 outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
        >
          Описание и наблюдатели
          {more ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {more && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="quick-create-description" className="text-[13px] font-semibold text-ink-80">
                Описание
              </label>
              <Textarea
                id="quick-create-description"
                rows={3}
                value={value.description}
                error={state.errors.description}
                onChange={(event) => {
                  setValue({ ...value, description: event.target.value })
                }}
              />
            </div>
            <UserPicker
              multiple
              label="Наблюдатели"
              search={userSearch}
              me={me}
              value={value.watchers}
              onChange={(watchers) => {
                setValue({ ...value, watchers })
              }}
            />
            {state.errors.watchers ? <p className="text-xs text-brand-red">{state.errors.watchers}</p> : null}
          </div>
        )}
        <Button
          type="button"
          className="h-12 w-full rounded-full"
          disabled={!state.canSubmit}
          aria-busy={state.busy}
          onClick={() => void state.submit()}
        >
          {state.busy ? 'Создаём…' : 'Создать задачу'}
        </Button>
      </>
    )

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <SheetContent
        side="bottom"
        {...(view === 'form' ? { title: 'Новая задача' } : { 'aria-label': view === 'deadline' ? 'Дедлайн' : 'Ответственный' })}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          title.current?.focus()
        }}
        className="gap-0"
      >
        {body}
      </SheetContent>
    </Sheet>
  )
}
