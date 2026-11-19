import { Button, Input, SegmentedControl, Switch } from '@synergy/ui-kit'
import { useId, useState } from 'react'
import {
  BASES,
  COUNTS,
  COURSE_TOPICS,
  DEFAULT_COUNT,
  DIRECTIONS,
  EGE_LEVELS,
  LEVELS,
  MAX_DIRECTIONS,
  STATE_SUPPORT_HIDDEN,
} from '@/shared/quick-search.config'
import type { EgeValue, LevelId, Segment } from '@/shared/quick-search.config'
import { buildQuickSearchQuery, buildQuickSearchTitle } from '@/shared/quick-search'
import { ChevronDown, ChevronRight, SlidersHorizontal } from '@synergy/ui-kit/icons'

interface Props {
  open: boolean
  onToggle: () => void
  pending: boolean
  /** Receives the query and a short chat title built from the form parameters. */
  onSubmit: (query: string, title: string) => void
}

const EGE_OPTIONS: { id: EgeValue; label: string }[] = [
  { id: 'unknown', label: 'Не знаю' },
  { id: 'yes', label: 'Есть' },
  { id: 'no', label: 'Нет' },
]

function toggleIn(list: string[], value: string, max = Infinity): string[] {
  if (list.includes(value)) return list.filter((v) => v !== value)
  return list.length >= max ? list : [...list, value]
}

function Segmented<T extends string | number>(props: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <SegmentedControl
      aria-label={props.label}
      className="flex-wrap rounded-2xl"
      options={props.options.map((option) => ({ value: String(option.id), label: option.label }))}
      value={String(props.value)}
      onValueChange={(next) => {
        const picked = props.options.find((option) => String(option.id) === next)
        if (picked !== undefined) props.onChange(picked.id)
      }}
    />
  )
}

function Tags(props: {
  options: string[]
  selected: string[]
  max?: number
  onToggle: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {props.options.map((option) => (
        <button
          key={option}
          type="button"
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            props.selected.includes(option)
              ? 'border-brand-red bg-brand-red-soft text-brand-red'
              : 'border-border bg-surface text-ink hover:bg-surface-alt'
          }`}
          onClick={() => {
            props.onToggle(option)
          }}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-ink-60">{label}</span>
      {children}
    </div>
  )
}

export function QuickSearchForm({ open, onToggle, pending, onSubmit }: Props) {
  const [segment, setSegment] = useState<Segment>('education')
  const [level, setLevel] = useState<LevelId>('any')
  const [base, setBase] = useState('')
  const [directions, setDirections] = useState<string[]>([])
  const [ege, setEge] = useState<EgeValue>('unknown')
  const [stateSupport, setStateSupport] = useState(false)
  const [topics, setTopics] = useState<string[]>([])
  const [topicText, setTopicText] = useState('')
  const [count, setCount] = useState<number>(DEFAULT_COUNT)

  const supportId = useId()
  const bases = BASES[level]

  const submit = () => {
    const form = {
      segment,
      level,
      base,
      directions,
      ege,
      stateSupport,
      topics,
      topicText,
      count,
    }
    onSubmit(buildQuickSearchQuery(form), buildQuickSearchTitle(form))
  }

  return (
    <section className="border-t border-border bg-surface-alt">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold text-ink disabled:text-ink-40"
        onClick={onToggle}
        disabled={pending}
        aria-expanded={open}
      >
        <SlidersHorizontal />
        <span className="min-w-0 flex-1">Быстрый подбор</span>
        <span className="text-ink-60">{open ? <ChevronDown /> : <ChevronRight />}</span>
      </button>
      {open && (
        <>
          <div className="flex max-h-72 flex-col gap-3.5 overflow-y-auto px-4 pb-3">
            <Field label="Что ищем">
              <Segmented
                label="Что ищем"
                options={[
                  { id: 'education', label: 'Образование' },
                  { id: 'courses', label: 'Курсы и ДПО' },
                ]}
                value={segment}
                onChange={setSegment}
              />
            </Field>

            {segment === 'education' ? (
              <>
                <Field label="Уровень">
                  <Segmented
                    label="Уровень"
                    options={LEVELS}
                    value={level}
                    onChange={(next) => {
                      setLevel(next)
                      setBase('')
                    }}
                  />
                </Field>
                {bases && (
                  <Field label="База клиента">
                    <Segmented
                      label="База клиента"
                      options={bases.map((b) => ({ id: b, label: b }))}
                      value={base}
                      onChange={(next) => {
                        setBase(next === base ? '' : next)
                      }}
                    />
                  </Field>
                )}
                <Field label={`Направление (до ${String(MAX_DIRECTIONS)})`}>
                  <Tags
                    options={DIRECTIONS.map((d) => d.label)}
                    selected={directions}
                    onToggle={(v) => {
                      setDirections((list) => toggleIn(list, v, MAX_DIRECTIONS))
                    }}
                  />
                </Field>
                {EGE_LEVELS.includes(level) && (
                  <Field label="ЕГЭ">
                    <Segmented label="ЕГЭ" options={EGE_OPTIONS} value={ege} onChange={setEge} />
                  </Field>
                )}
                {!STATE_SUPPORT_HIDDEN.includes(level) && (
                  <div className="flex items-center gap-2 text-xs text-ink">
                    <Switch
                      id={supportId}
                      checked={stateSupport}
                      onCheckedChange={setStateSupport}
                    />
                    <label htmlFor={supportId}>Только с господдержкой</label>
                  </div>
                )}
              </>
            ) : (
              <Field label="Тема">
                <Tags
                  options={COURSE_TOPICS}
                  selected={topics}
                  onToggle={(v) => {
                    setTopics((list) => toggleIn(list, v))
                  }}
                />
                <Input
                  type="text"
                  className="h-9 text-sm"
                  placeholder="Своя тема"
                  aria-label="Своя тема"
                  value={topicText}
                  onChange={(event) => {
                    setTopicText(event.target.value)
                  }}
                />
              </Field>
            )}

            <Field label="Сколько показать">
              <Segmented
                label="Сколько показать"
                options={COUNTS.map((n) => ({ id: n, label: String(n) }))}
                value={count}
                onChange={setCount}
              />
            </Field>
          </div>
          <div className="border-t border-border px-4 pt-2.5 pb-3">
            <Button className="w-full" disabled={pending} onClick={submit}>
              Начать подбор
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
