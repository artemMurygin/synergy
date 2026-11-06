import { useState } from 'react'
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
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {props.options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            props.value === option.id
              ? 'border-brand-red bg-brand-red-soft text-brand-red'
              : 'border-line bg-white text-ink hover:bg-surface-alt'
          }`}
          onClick={() => {
            props.onChange(option.id)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
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
              : 'border-line bg-white text-ink hover:bg-surface-alt'
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
    <section className="border-t border-line bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-3 text-xs font-semibold text-ink disabled:text-ink-40"
        onClick={onToggle}
        disabled={pending}
        aria-expanded={open}
      >
        Быстрый подбор
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto px-3 pb-3">
            <Field label="Что ищем">
              <Segmented
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
                    <Segmented options={EGE_OPTIONS} value={ege} onChange={setEge} />
                  </Field>
                )}
                {!STATE_SUPPORT_HIDDEN.includes(level) && (
                  <label className="flex items-center gap-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      checked={stateSupport}
                      onChange={(event) => {
                        setStateSupport(event.target.checked)
                      }}
                    />
                    Только с господдержкой
                  </label>
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
                <input
                  type="text"
                  className="rounded-xl border border-line px-3 py-1.5 text-sm outline-none focus:border-brand-red"
                  placeholder="Своя тема"
                  value={topicText}
                  onChange={(event) => {
                    setTopicText(event.target.value)
                  }}
                />
              </Field>
            )}

            <Field label="Сколько показать">
              <Segmented
                options={COUNTS.map((n) => ({ id: n, label: String(n) }))}
                value={count}
                onChange={setCount}
              />
            </Field>
          </div>
          <div className="px-3 pb-3 pt-2">
            <button
              type="button"
              disabled={pending}
              className="h-10 w-full rounded-full bg-brand-red text-sm font-semibold text-white shadow-md hover:bg-brand-red-hover disabled:bg-ink-40 disabled:shadow-none"
              onClick={submit}
            >
              Начать подбор
            </button>
          </div>
        </>
      )}
    </section>
  )
}
