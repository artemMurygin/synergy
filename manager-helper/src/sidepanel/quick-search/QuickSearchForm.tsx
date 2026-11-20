import { Button, Input, SegmentedControl, Switch } from '@synergy/ui-kit'
import { ArrowUpRight, Check, ChevronDown, ChevronLeft, CircleAlert, FileText } from '@synergy/ui-kit/icons'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import {
  BASES,
  COUNTS,
  COURSE_TOPICS,
  DIRECTIONS,
  EGE_LEVELS,
  LEVELS,
  MAX_DIRECTIONS,
  STATE_SUPPORT_HIDDEN,
} from '@/shared/quick-search.config'
import type { EgeValue } from '@/shared/quick-search.config'
import { buildQuickSearchQuery, buildQuickSearchTitle } from '@/shared/quick-search'
import type { QuickSearchValues } from './defaults'

interface Props {
  value: QuickSearchValues
  onChange: (value: QuickSearchValues) => void
  /** The agent is answering: the submit is blocked. */
  pending: boolean
  /** Receives the query and a short chat title built from the form parameters. */
  onSubmit: (query: string, title: string) => void
  /** Head of the main view (the sheet puts its title and the close button here). */
  header?: ReactNode
}

const EGE_OPTIONS: { id: EgeValue; label: string }[] = [
  { id: 'unknown', label: 'Не знаю' },
  { id: 'yes', label: 'Есть' },
  { id: 'no', label: 'Нет' },
]

function toggleIn(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((v) => v !== item) : [...list, item]
}

function Chip(props: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      className={`h-8 rounded-full border px-3 text-[13px] font-medium ${
        props.selected
          ? 'border-brand-red bg-brand-red-soft text-brand-red'
          : 'border-border bg-surface text-ink hover:bg-surface-alt'
      }`}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}

function Field(props: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={props.label} className={`flex flex-col gap-1.5 ${props.className ?? ''}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-ink-60">{props.label}</span>
        {props.hint !== undefined && <span className="text-ink-40">{props.hint}</span>}
      </div>
      {props.children}
    </div>
  )
}

function Chips<T extends string | number>(props: {
  options: { id: T; label: string }[]
  selected: (id: T) => boolean
  onPick: (id: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {props.options.map((option) => (
        <Chip
          key={option.id}
          label={option.label}
          selected={props.selected(option.id)}
          onClick={() => {
            props.onPick(option.id)
          }}
        />
      ))}
    </div>
  )
}

function DirectionPicker(props: {
  selected: string[]
  onToggle: (label: string) => void
  onDone: () => void
}) {
  const full = props.selected.length >= MAX_DIRECTIONS
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Назад"
          className="flex size-9 items-center justify-center rounded-full bg-surface-alt text-ink hover:bg-surface-sunken"
          onClick={props.onDone}
        >
          <ChevronLeft />
        </button>
        <h2 className="flex-1 font-display text-lg font-semibold text-ink">Направление</h2>
        <span className="rounded-full bg-brand-red-soft px-2.5 py-1 text-xs font-semibold text-brand-red">
          {props.selected.length} из {MAX_DIRECTIONS}
        </span>
      </div>
      {full && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-[13px] text-ink-80"
        >
          <span className="mt-0.5 shrink-0 text-warning">
            <CircleAlert size={16} />
          </span>
          Можно выбрать до 3 направлений. Снимите одно, чтобы выбрать другое.
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {DIRECTIONS.map((direction) => {
          const picked = props.selected.includes(direction.label)
          const locked = full && !picked
          return (
            <button
              key={direction.label}
              type="button"
              role="checkbox"
              aria-checked={picked}
              disabled={locked}
              className="flex items-start gap-3 py-2 text-left disabled:opacity-40"
              onClick={() => {
                props.onToggle(direction.label)
              }}
            >
              <span className={`mt-0.5 shrink-0 ${picked ? 'text-brand-red' : 'text-transparent'}`}>
                <Check size={18} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px] text-ink">{direction.label}</span>
                {direction.aliases.length > 0 && (
                  <span className="text-xs text-ink-40">{direction.aliases.join(', ')}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <Button className="w-full" onClick={props.onDone}>
        Готово
      </Button>
    </div>
  )
}

/** Controlled quick search form: fields, the preview of the query and the submit into the chat. */
export function QuickSearchForm({ value, onChange, pending, onSubmit, header }: Props) {
  const [picking, setPicking] = useState(false)
  const supportId = useId()
  const set = (patch: Partial<QuickSearchValues>) => {
    onChange({ ...value, ...patch })
  }

  const toggleDirection = (label: string) => {
    if (value.directions.includes(label)) {
      set({ directions: value.directions.filter((d) => d !== label) })
    } else if (value.directions.length < MAX_DIRECTIONS) {
      set({ directions: [...value.directions, label] })
    }
  }

  if (picking) {
    return (
      <DirectionPicker
        selected={value.directions}
        onToggle={toggleDirection}
        onDone={() => {
          setPicking(false)
        }}
      />
    )
  }

  const query = buildQuickSearchQuery(value)
  const title = buildQuickSearchTitle(value)
  const bases = BASES[value.level]
  const directionsText = value.directions.join(', ')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {header}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
        <Field label="Что ищем">
          <SegmentedControl
            aria-label="Что ищем"
            options={[
              { value: 'education', label: 'Образование' },
              { value: 'courses', label: 'Курсы и ДПО' },
            ]}
            value={value.segment}
            onValueChange={(next) => {
              set({ segment: next === 'courses' ? 'courses' : 'education' })
            }}
          />
        </Field>

        {value.segment === 'education' ? (
          <>
            <Field label="Уровень">
              <span className="relative block">
                <select
                  aria-label="Уровень"
                  className="h-11 w-full appearance-none rounded-xl bg-surface-alt px-3.5 pr-10 text-[15px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
                  value={value.level}
                  onChange={(event) => {
                    const picked = LEVELS.find((level) => level.id === event.target.value)
                    if (picked !== undefined) set({ level: picked.id, base: '' })
                  }}
                >
                  {LEVELS.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-60">
                  <ChevronDown size={18} />
                </span>
              </span>
            </Field>
            {bases !== undefined && (
              <Field label="База клиента" hint="необязательно">
                <Chips
                  options={bases.map((b) => ({ id: b, label: b }))}
                  selected={(id) => value.base === id}
                  onPick={(id) => {
                    set({ base: value.base === id ? '' : id })
                  }}
                />
              </Field>
            )}
            <Field
              label="Направление"
              hint={
                value.directions.length === 0
                  ? `до ${String(MAX_DIRECTIONS)}`
                  : `выбрано ${String(value.directions.length)} из ${String(MAX_DIRECTIONS)}`
              }
            >
              <button
                type="button"
                aria-label="Направление"
                className="flex h-11 w-full items-center gap-2 rounded-xl bg-surface-alt px-3.5 text-left text-[15px] hover:bg-surface-sunken"
                onClick={() => {
                  setPicking(true)
                }}
              >
                <span className={`min-w-0 flex-1 truncate ${directionsText === '' ? 'text-ink-40' : 'text-ink'}`}>
                  {directionsText === '' ? 'Любое' : directionsText}
                </span>
                <span className="text-ink-60">
                  <ChevronDown size={18} />
                </span>
              </button>
            </Field>
          </>
        ) : (
          <Field label="Тема" hint="можно несколько">
            <Chips
              options={COURSE_TOPICS.map((topic) => ({ id: topic, label: topic }))}
              selected={(id) => value.topics.includes(id)}
              onPick={(id) => {
                set({ topics: toggleIn(value.topics, id) })
              }}
            />
            <Input
              type="text"
              placeholder="Своя тема"
              aria-label="Своя тема"
              value={value.topicText}
              onChange={(event) => {
                set({ topicText: event.target.value })
              }}
            />
          </Field>
        )}

        <div className="flex flex-wrap items-start gap-x-6 gap-y-3.5">
          {value.segment === 'education' && EGE_LEVELS.includes(value.level) && (
            <Field label="ЕГЭ" className="min-w-0 flex-1">
              <Chips
                options={EGE_OPTIONS}
                selected={(id) => value.ege === id}
                onPick={(id) => {
                  set({ ege: id })
                }}
              />
            </Field>
          )}
          <Field label="Сколько показать">
            <Chips
              options={COUNTS.map((n) => ({ id: n, label: String(n) }))}
              selected={(id) => value.count === id}
              onPick={(id) => {
                set({ count: id })
              }}
            />
          </Field>
        </div>

        {value.segment === 'education' && !STATE_SUPPORT_HIDDEN.includes(value.level) && (
          <div className="flex items-center gap-2.5 text-[15px] text-ink">
            <Switch
              id={supportId}
              checked={value.stateSupport}
              onCheckedChange={(checked) => {
                set({ stateSupport: checked })
              }}
            />
            <label htmlFor={supportId}>Только с господдержкой</label>
          </div>
        )}
      </div>

      <section aria-label="Запрос в чат" className="flex flex-col gap-1.5 rounded-xl bg-surface-alt p-3.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-60">
          <FileText size={14} />
          <span>Запрос в чат</span>
        </div>
        <p className="max-h-32 overflow-y-auto text-[13px] leading-[1.4] text-ink">{query}</p>
        <p className="text-xs text-ink-40">Название чата: {title}</p>
      </section>

      <Button
        className="h-12 w-full"
        disabled={pending}
        onClick={() => {
          onSubmit(query, title)
        }}
      >
        Отправить в чат
        <ArrowUpRight size={18} />
      </Button>
    </div>
  )
}
