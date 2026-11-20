import { Button, UserAvatar } from '@synergy/ui-kit'
import type { UserSearchProps } from '@synergy/ui-kit'
import { Search } from '@synergy/ui-kit/icons'
import { useState } from 'react'
import type { UserSummary } from '@/shared/tasks-api'
import { SheetBack } from './SheetBack'

interface Props {
  value: UserSummary | null
  me: UserSummary
  search: UserSearchProps
  /** "Готово" ends with the picked user. */
  onPick: (user: UserSummary) => void
  /** "Назад" returns to the form without changing the assignee. */
  onBack: () => void
}

/** The nested sheet "Ответственный" of the quick create (AxP1M): search by login and the list. */
export function AssigneeSheet({ value, me, search, onPick, onBack }: Props) {
  const [picked, setPicked] = useState<UserSummary | null>(value)
  const pageSize = search.pageSize
  const full = pageSize !== undefined && search.users.length >= pageSize

  return (
    <>
      <SheetBack title="Ответственный" onBack={onBack} />
      <label className="flex h-11 items-center gap-2 rounded-full bg-surface-alt px-4 text-ink-40 focus-within:ring-2 focus-within:ring-brand-red/30">
        <Search size={16} />
        <input
          type="search"
          autoFocus
          aria-label="Поиск по логину"
          placeholder="Поиск по логину"
          onChange={(event) => {
            search.onSearch(event.target.value)
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-40 [&::-webkit-search-cancel-button]:hidden"
        />
      </label>
      <div className="flex max-h-[274px] flex-col overflow-y-auto">
        {search.error ? (
          <p role="alert" className="px-3 py-2 text-[13px] text-brand-red">
            {search.error}
          </p>
        ) : null}
        {search.users.map((user) => (
          <button
            key={user.id}
            type="button"
            aria-pressed={picked?.id === user.id}
            onClick={() => {
              setPicked(user)
            }}
            className={`flex h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 ${
              picked?.id === user.id ? 'bg-brand-red-soft' : 'hover:bg-surface-alt'
            }`}
          >
            <UserAvatar login={user.login} />
            <span className="text-sm font-semibold text-ink">{user.login}</span>
            {user.id === me.id ? <span className="text-xs text-ink-40">это вы</span> : null}
          </button>
        ))}
        {!search.loading && !search.error && search.users.length === 0 ? (
          <p className="px-3 py-2 text-[13px] text-ink-60">Никого не найдено</p>
        ) : null}
      </div>
      {full ? (
        <p className="text-center text-xs text-ink-40">
          Показаны первые {search.users.length} · уточните поиск
        </p>
      ) : null}
      <Button
        className="h-12 w-full rounded-full"
        disabled={picked === null}
        onClick={() => {
          if (picked !== null) onPick(picked)
        }}
      >
        Готово
      </Button>
    </>
  )
}
