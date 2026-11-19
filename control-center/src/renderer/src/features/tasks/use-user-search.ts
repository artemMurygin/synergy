import type { UserSearchProps } from '@synergy/ui-kit'
import { useState } from 'react'
import { useUsersSearch } from '@/lib/backend/tasks.queries'

/** Users for the package pickers: the query follows the typed text after a pause. */
export function useUserSearch(): UserSearchProps {
  const [search, setSearch] = useState('')
  const query = useUsersSearch(search.trim())
  return {
    users: query.data?.items ?? [],
    loading: query.isPending,
    error: query.isError ? 'Не удалось загрузить пользователей' : null,
    onSearch: setSearch,
    onRetry: () => {
      void query.refetch()
    }
  }
}
