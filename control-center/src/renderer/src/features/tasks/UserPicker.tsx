import { Check, ChevronDown, Users, X } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSessionStore } from '@/features/auth/session.store'
import { useUsersSearch } from '@/lib/backend/tasks.queries'
import type { UserSummary } from '@/lib/backend/tasks.schema'
import { cn } from '@/lib/utils'

export const WATCHERS_LIMIT = 50

interface CommonProps {
  /** Accessible name; used on its own when `labelledBy` is not given. */
  label: string
  /** Id of a visible label element; the field value is appended to the name. */
  labelledBy?: string
  id?: string
  placeholder?: string
  invalid?: boolean
  describedBy?: string
  /** What is being picked, for the limit message ("наблюдателей"). */
  itemsLabel?: string
}

interface SingleProps extends CommonProps {
  multiple?: false
  value: UserSummary | null
  onChange: (user: UserSummary | null) => void
}

interface MultipleProps extends CommonProps {
  multiple: true
  value: UserSummary[]
  onChange: (users: UserSummary[]) => void
  max?: number
}

export type UserPickerProps = SingleProps | MultipleProps

const initials = (login: string): string => login.slice(0, 2).toUpperCase()

function Avatar({ login }: { login: string }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-semibold"
    >
      {initials(login)}
    </span>
  )
}

interface UserListProps {
  selected: UserSummary[]
  multiple: boolean
  max: number
  itemsLabel: string
  onPick: (user: UserSummary) => void
}

function UserList({ selected, multiple, max, itemsLabel, onPick }: UserListProps) {
  const meId = useSessionStore((s) => s.snapshot.user?.id ?? null)
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const query = useUsersSearch(search.trim())
  const items = query.data?.items ?? []
  const activeIndex = Math.min(active, Math.max(items.length - 1, 0))
  const optionId = (index: number) => `${listId}-${String(index)}`
  const full = multiple && selected.length >= max
  const isSelected = (user: UserSummary) => selected.some((s) => s.id === user.id)
  const isBlocked = (user: UserSummary) => full && !isSelected(user)

  const pick = (user: UserSummary) => {
    if (!isBlocked(user)) onPick(user)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (items.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((activeIndex + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((activeIndex - 1 + items.length) % items.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      pick(items[activeIndex])
    }
  }

  return (
    <div>
      <div className="p-3">
        <Input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={items.length > 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label="Поиск по логину"
          placeholder="Поиск по логину"
          className="h-10 rounded-full"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="max-h-[220px] overflow-y-auto border-t">
        {query.isError && (
          <div role="alert" className="flex items-center gap-2 px-4 py-3 text-[13px] text-brand-red">
            <span className="flex-1">Не удалось загрузить пользователей</span>
            <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>
              Повторить
            </button>
          </div>
        )}
        {query.isPending && (
          <p role="status" className="px-4 py-3 text-[13px] text-ink-60">
            Загрузка…
          </p>
        )}
        {query.data && items.length === 0 && <p className="px-4 py-3 text-[13px] text-ink-60">Никого не нашли</p>}
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
              // keep the focus in the search field
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => pick(user)}
              className={cn(
                'flex h-11 cursor-pointer items-center gap-2.5 px-4 text-sm',
                index === activeIndex && 'bg-surface-alt',
                isSelected(user) && 'bg-brand-red-soft',
                isBlocked(user) && 'cursor-not-allowed opacity-50'
              )}
            >
              <Avatar login={user.login} />
              <span className="flex-1 truncate font-medium">{user.login}</span>
              {user.id === meId && <span className="text-xs text-ink-60">это вы</span>}
              {isSelected(user) && <Check aria-hidden className="size-4 text-brand-red" />}
            </li>
          ))}
        </ul>
      </div>
      {multiple && (
        <div className="border-t bg-surface-alt px-4 py-2.5 text-xs text-ink-60">
          <p>
            Выбрано {selected.length} из {max}
          </p>
          {full && (
            <p role="status" className="mt-1">
              Достигнут лимит: не более {max} {itemsLabel}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Search-by-login picker over active users: one user (`multiple` off) or several without repeats. */
export function UserPicker(props: UserPickerProps) {
  const { label, labelledBy, placeholder, invalid, describedBy, itemsLabel = 'пользователей' } = props
  const fallbackId = useId()
  const id = props.id ?? fallbackId
  const [open, setOpen] = useState(false)
  const multiple = props.multiple === true
  const max = props.multiple ? (props.max ?? WATCHERS_LIMIT) : 1
  const selected = props.multiple ? props.value : props.value ? [props.value] : []

  const pick = (user: UserSummary) => {
    if (props.multiple) {
      const has = props.value.some((s) => s.id === user.id)
      props.onChange(has ? props.value.filter((s) => s.id !== user.id) : [...props.value, user])
      return
    }
    props.onChange(props.value?.id === user.id ? null : user)
    setOpen(false)
  }

  const current = !props.multiple ? props.value : null
  const text = multiple ? (placeholder ?? 'Добавить наблюдателей') : (placeholder ?? 'Выберите')

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-label={labelledBy ? undefined : label}
            aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(
              'flex h-12 w-full items-center gap-2.5 rounded-md border bg-background px-3.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
              invalid ? 'border-brand-red' : 'border-border-strong'
            )}
          >
            {multiple ? <Users aria-hidden className="size-4 shrink-0 text-ink-60" /> : current && <Avatar login={current.login} />}
            <span className={cn('flex-1 truncate', !current && 'text-muted-foreground')}>{current ? current.login : text}</span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <UserList selected={selected} multiple={multiple} max={max} itemsLabel={itemsLabel} onPick={pick} />
        </PopoverContent>
      </Popover>
      {props.multiple && props.value.length > 0 && (
        <ul aria-label="Выбранные" className="flex flex-wrap gap-1.5">
          {props.value.map((user) => (
            <li
              key={user.id}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-sunken pr-1 pl-3 text-[13px] font-medium"
            >
              {user.login}
              <button
                type="button"
                aria-label={`Убрать ${user.login}`}
                onClick={() => props.onChange(props.value.filter((s) => s.id !== user.id))}
                className="flex size-5 items-center justify-center rounded-full outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
