import { useEffect, useId, useRef, useState } from 'react'
import { searchUsers } from '@/shared/tasks-api'
import type { UserSummary } from '@/shared/tasks-api'

interface Props {
  /** Currently chosen user, shown as the input placeholder. */
  value: UserSummary | null
  onChange: (user: UserSummary) => void
  /** Фокус в поле поиска сразу после появления (выпадающий список ответственного). */
  autoFocus?: boolean
  /** Accessible name of the search field. */
  label?: string
  /** Multiple choice: these users are marked as selected and the field keeps its placeholder. */
  selectedIds?: string[]
}

/** Assignee search over `GET /users`; the latest query wins. */
export function UserSearchSelect({
  value,
  onChange,
  autoFocus = false,
  label = 'Ответственный',
  selectedIds,
}: Props) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSummary[]>([])
  const [failed, setFailed] = useState(false)
  const latest = useRef(0)

  useEffect(() => {
    const id = ++latest.current
    searchUsers(query, 20).then(
      (page) => {
        if (id !== latest.current) return
        setFailed(false)
        setResults(page.items)
      },
      () => {
        if (id !== latest.current) return
        setFailed(true)
        setResults([])
      },
    )
  }, [query])

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-multiselectable={selectedIds === undefined ? undefined : true}
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        placeholder={value === null ? 'Поиск по логину' : value.login}
        value={query}
        className="w-full rounded-xl border border-field-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-60 focus:border-brand-red"
        onChange={(event) => {
          setQuery(event.target.value)
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Пользователи"
        className="max-h-40 overflow-y-auto rounded-xl border border-field-line bg-surface"
      >
        {failed && (
          <li className="px-3 py-2 text-xs text-ink-60">Не удалось найти пользователей</li>
        )}
        {!failed && results.length === 0 && (
          <li className="px-3 py-2 text-xs text-ink-60">Никого не найдено</li>
        )}
        {results.map((user) => (
          <li key={user.id} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={selectedIds?.includes(user.id) ?? value?.id === user.id}
              className="block w-full px-3 py-2 text-left text-sm break-words text-ink hover:bg-surface-alt aria-selected:font-semibold"
              onClick={() => {
                onChange(user)
              }}
            >
              {user.login}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
