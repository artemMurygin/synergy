import { useEffect, useState } from 'react'
import { AlarmClock, ArrowUpDown, ChevronDown, Search } from '../icons'
import { useLayoutMode } from '../layout/layout-mode'
import { cn } from '../lib/cn'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../primitives/Menu'
import { selectedSegment, taskViewLayout, TASK_VIEW_LABEL, type TaskView } from './task-views'
import { STATUS_LABEL, TASK_STATUSES, type TaskSort, type TaskStatusFilter } from './types'

export const SEARCH_DEBOUNCE_MS = 300

export type TaskFiltersProps = {
  view: TaskView
  onViewChange: (view: TaskView) => void
  status: TaskStatusFilter
  onStatusChange: (status: TaskStatusFilter) => void
  sort: TaskSort
  onSortChange: (sort: TaskSort) => void
  overdueCount?: number
  search: string
  onSearch: (search: string) => void
  /** Поле поиска рисует контейнер (строка поиска mobile). */
  hideSearch?: boolean
}

const SORT_LABEL: Record<TaskSort, string> = {
  deadline: 'По дедлайну',
  updated: 'Сначала обновлённые',
  created: 'Сначала новые',
}

const SORTS: TaskSort[] = ['deadline', 'updated', 'created']

const pill = 'inline-flex h-8 items-center gap-1.5 rounded-2xl bg-surface-alt px-3 text-[13px] font-medium text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40'

function Count({ value }: { value: number }) {
  return (
    <span className="inline-flex h-[18px] min-w-[19px] items-center justify-center rounded-full bg-brand-red px-1.5 text-[11px] font-bold text-surface">
      {value}
    </span>
  )
}

function SearchField({ search, onSearch }: { search: string; onSearch: (value: string) => void }) {
  const [text, setText] = useState(search)
  const [seen, setSeen] = useState(search)
  if (seen !== search) {
    setSeen(search)
    setText(search)
  }

  useEffect(() => {
    if (text === search) return
    const timer = setTimeout(() => {
      onSearch(text)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [text, search, onSearch])

  return (
    <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-alt px-3.5 text-ink-40 focus-within:ring-2 focus-within:ring-brand-red/30">
      <Search size={16} />
      <input
        type="search"
        aria-label="Поиск по названию"
        placeholder="Поиск по названию"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-40"
      />
    </label>
  )
}

export function TaskFilters(props: TaskFiltersProps) {
  const mode = useLayoutMode()
  const { segments, menu } = taskViewLayout(mode)
  const active = selectedSegment(mode, props.view)
  const overdue = props.overdueCount ?? 0
  const desktop = mode === 'desktop'

  const segmentClass = (on: boolean, danger = false) =>
    cn(
      'inline-flex h-[30px] items-center gap-1.5 rounded-[15px] px-3 text-[13px] whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40',
      on ? 'bg-surface font-semibold text-ink shadow-[0_1px_3px_var(--color-shadow-card)]' : 'font-medium text-ink-60 hover:text-ink',
      danger && !on && 'text-brand-red',
    )

  const views = (
    <div
      role="group"
      aria-label="Представление"
      className="inline-flex items-center gap-0.5 rounded-[18px] bg-surface-alt p-[3px]"
    >
      {segments.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={active === id}
          className={segmentClass(active === id, id === 'overdue')}
          onClick={() => {
            props.onViewChange(id)
          }}
        >
          {id === 'overdue' ? <AlarmClock size={14} /> : null}
          {TASK_VIEW_LABEL[id]}
          {id === 'overdue' && overdue > 0 ? <Count value={overdue} /> : null}
        </button>
      ))}
      {menu.length > 0 ? (
        <Menu>
          <MenuTrigger asChild>
            <button type="button" aria-pressed={active === 'more'} className={segmentClass(active === 'more')}>
              Ещё
              <ChevronDown size={14} />
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="min-w-[220px] rounded-2xl">
            {menu.map((id) => (
              <MenuItem
                key={id}
                className="h-9 justify-between rounded-[10px] text-sm font-medium text-ink-80"
                onSelect={() => {
                  props.onViewChange(id)
                }}
              >
                <span>{TASK_VIEW_LABEL[id]}</span>
                {id === 'overdue' && overdue > 0 ? <Count value={overdue} /> : null}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
    </div>
  )

  const statusMenu = (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className={pill} aria-label={`Статус: ${props.status === 'all' ? 'все' : STATUS_LABEL[props.status]}`}>
          {props.status === 'all' ? (desktop ? 'Все статусы' : 'Статус') : STATUS_LABEL[props.status]}
          <ChevronDown size={14} />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="min-w-[200px] rounded-2xl">
        <MenuItem onSelect={() => { props.onStatusChange('all') }}>Все статусы</MenuItem>
        {TASK_STATUSES.map((status) => (
          <MenuItem key={status} onSelect={() => { props.onStatusChange(status) }}>
            {STATUS_LABEL[status]}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )

  const sortMenu = (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={cn(pill, !desktop && 'w-8 justify-center px-0')}
          aria-label={`Сортировка: ${SORT_LABEL[props.sort]}`}
        >
          <ArrowUpDown size={16} />
          {desktop ? SORT_LABEL[props.sort] : null}
          {desktop ? <ChevronDown size={14} /> : null}
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[220px] rounded-2xl">
        {SORTS.map((sort) => (
          <MenuItem key={sort} onSelect={() => { props.onSortChange(sort) }}>
            {SORT_LABEL[sort]}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )

  if (desktop) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        {views}
        <div className="w-[260px] max-w-full flex-1">
          <SearchField search={props.search} onSearch={props.onSearch} />
        </div>
        {statusMenu}
        {sortMenu}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-3 pb-2">
      {props.hideSearch ? null : <SearchField search={props.search} onSearch={props.onSearch} />}
      {views}
      <div data-testid="filters-secondary-row" className="flex items-center gap-1.5">
        {statusMenu}
        <span className="flex-1" />
        {sortMenu}
      </div>
    </div>
  )
}
