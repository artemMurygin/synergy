import { useEffect, useId, useRef, useState } from 'react'
import { searchUsers } from '@/shared/tasks-api'
import type { UserSummary } from '@/shared/tasks-api'

interface Props {
  /** Currently chosen user, shown as the input placeholder. */
  value: UserSummary | null
  onChange: (user: UserSummary) => void
}

/** Assignee search over `GET /users`; the latest query wins. */
export function UserSearchSelect({ value, onChange }: Props) {
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
        aria-label="Ответственный"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={value === null ? 'Поиск по логину' : value.login}
        value={query}
        className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-60"
        onChange={(event) => {
          setQuery(event.target.value)
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Пользователи"
        className="max-h-40 overflow-y-auto rounded-xl border border-line bg-white"
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
              aria-selected={value?.id === user.id}
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
