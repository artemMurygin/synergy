import { useId, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search, User, Users, X } from '../icons'
import { cn } from '../lib/cn'
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/Popover'
import type { UserSummary } from './types'
import { UserAvatar } from './UserAvatar'

export const WATCHERS_LIMIT = 50

/** Результаты поиска пользователей: запросы делает приложение. */
export type UserSearchProps = {
  users: UserSummary[]
  loading?: boolean
  error?: string | null
  onSearch: (query: string) => void
  onRetry?: () => void
}

type CommonProps = {
  /** Доступное имя кнопки-триггера. */
  label: string
  search: UserSearchProps
  /** Текущий пользователь: включает кнопку «Я». */
  me?: UserSummary
  placeholder?: string
  /** Что выбираем, для сообщения о лимите («наблюдателей»). */
  itemsLabel?: string
}

type SingleProps = CommonProps & {
  multiple?: false
  value: UserSummary | null
  onChange: (user: UserSummary | null) => void
}

type MultipleProps = CommonProps & {
  multiple: true
  value: UserSummary[]
  onChange: (users: UserSummary[]) => void
  max?: number
}

export type UserPickerProps = SingleProps | MultipleProps

type ListProps = {
  search: UserSearchProps
  selected: UserSummary[]
  multiple: boolean
  max: number
  itemsLabel: string
  meId?: string
  onPick: (user: UserSummary) => void
}

function UserList({ search, selected, multiple, max, itemsLabel, meId, onPick }: ListProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const items = search.users
  const activeIndex = Math.min(active, Math.max(items.length - 1, 0))
  const optionId = (index: number) => `${listId}-${String(index)}`
  const full = multiple && selected.length >= max
  const isSelected = (user: UserSummary) => selected.some((s) => s.id === user.id)
  const isBlocked = (user: UserSummary) => full && !isSelected(user)
  const pick = (user: UserSummary) => {
    if (!isBlocked(user)) onPick(user)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (items.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((activeIndex + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((activeIndex - 1 + items.length) % items.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const user = items[activeIndex]
      if (user) pick(user)
    }
  }

  return (
    <div>
      <div className="relative p-2">
        <Search aria-hidden="true" size={16} className="pointer-events-none absolute top-[19px] left-5 text-ink-40" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items.length > 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label="Поиск по логину"
          placeholder="Поиск по логину"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            search.onSearch(event.target.value)
          }}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-xl bg-surface-alt pr-3 pl-9 text-sm text-ink outline-none placeholder:text-ink-40 focus-visible:ring-2 focus-visible:ring-brand-red/30"
        />
      </div>
      <div className="max-h-[220px] overflow-y-auto">
        {search.error ? (
          <div role="alert" className="flex items-center gap-2 px-3 py-2 text-[13px] text-brand-red">
            <span className="flex-1">{search.error}</span>
            {search.onRetry ? (
              <button type="button" className="font-semibold underline" onClick={search.onRetry}>
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}
        {search.loading ? (
          <p role="status" className="px-3 py-2 text-[13px] text-ink-60">
            Загрузка…
          </p>
        ) : null}
        {!search.loading && !search.error && items.length === 0 ? (
          <p className="px-3 py-2 text-[13px] text-ink-60">Никого не нашли</p>
        ) : null}
        <ul
          id={listId}
          role="listbox"
          aria-label="Пользователи"
          aria-multiselectable={multiple || undefined}
          hidden={items.length === 0}
        >
          {items.map((user, index) => (
            <li
              key={user.id}
              id={optionId(index)}
              role="option"
              aria-selected={isSelected(user)}
              aria-disabled={isBlocked(user) || undefined}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onMouseMove={() => {
                setActive(index)
              }}
              onClick={() => {
                pick(user)
              }}
              className={cn(
                'flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm',
                index === activeIndex && !isSelected(user) && 'bg-surface-alt',
                isSelected(user) && 'bg-brand-red-soft',
                isBlocked(user) && 'cursor-not-allowed opacity-50',
              )}
            >
              <UserAvatar login={user.login} size="sm" />
              <span className="flex-1 truncate font-medium">{user.login}</span>
              {user.id === meId ? <span className="text-xs text-ink-60">это вы</span> : null}
              {isSelected(user) ? <Check size={16} className="text-brand-red" /> : null}
            </li>
          ))}
        </ul>
      </div>
      {multiple ? (
        <div className="mt-1 flex flex-col justify-center border-t border-border px-3 py-2 text-xs text-ink-60">
          <p>{`Выбрано ${String(selected.length)} из ${String(max)}`}</p>
          {full ? (
            <p role="status" className="mt-1">
              {`Достигнут лимит: не более ${String(max)} ${itemsLabel}`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Выбор пользователей по логину: одного или нескольких без повторов. */
export function UserPicker(props: UserPickerProps) {
  const { label, search, me, itemsLabel = 'наблюдателей' } = props
  const [open, setOpen] = useState(false)
  const multiple = props.multiple === true
  const max = props.multiple ? (props.max ?? WATCHERS_LIMIT) : 1
  const selected: UserSummary[] = props.multiple ? props.value : props.value ? [props.value] : []
  const current = props.multiple ? null : props.value

  function toggle(user: UserSummary) {
    if (props.multiple) {
      const has = props.value.some((s) => s.id === user.id)
      props.onChange(has ? props.value.filter((s) => s.id !== user.id) : [...props.value, user])
      return
    }
    props.onChange(props.value?.id === user.id ? null : user)
    setOpen(false)
  }

  const meSelected = me !== undefined && selected.some((s) => s.id === me.id)
  const canPickMe = me !== undefined && !meSelected && (!multiple || selected.length < max)
  const Icon = multiple ? Users : User

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (next) search.onSearch('')
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={label}
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface-alt px-3 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
            >
              <Icon aria-hidden="true" size={16} className="shrink-0 text-ink-40" />
              <span className={cn('flex-1 truncate', current ? 'font-medium text-ink' : 'text-ink-40')}>
                {current ? current.login : (props.placeholder ?? (multiple ? 'Добавить наблюдателей' : 'Выберите'))}
              </span>
              <ChevronDown aria-hidden="true" size={14} className="shrink-0 text-ink-40" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 rounded-2xl p-1">
            <UserList
              search={search}
              selected={selected}
              multiple={multiple}
              max={max}
              itemsLabel={itemsLabel}
              meId={me?.id}
              onPick={toggle}
            />
          </PopoverContent>
        </Popover>
        {canPickMe ? (
          <button
            type="button"
            onClick={() => {
              toggle(me)
            }}
            className="inline-flex h-9 shrink-0 items-center rounded-xl bg-surface-alt px-3 text-[13px] font-semibold text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            Я
          </button>
        ) : null}
      </div>
      {props.multiple && props.value.length > 0 ? (
        <ul aria-label="Выбранные" className="flex flex-wrap gap-1.5">
          {props.value.map((user) => (
            <li
              key={user.id}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-alt pr-1 pl-3 text-[13px] font-medium text-ink"
            >
              {user.login}
              <button
                type="button"
                aria-label={`Убрать ${user.login}`}
                onClick={() => {
                  props.onChange(props.value.filter((s) => s.id !== user.id))
                }}
                className="flex size-5 items-center justify-center rounded-full outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
