import type { UserSearchProps } from '@synergy/ui-kit'
import { useCallback, useEffect, useState } from 'react'
import { searchUsers } from '@/shared/tasks-api'
import type { UserSummary } from '@/shared/tasks-api'

export const USER_SEARCH_DEBOUNCE_MS = 250
const USER_LIMIT = 20

/** Users for the pickers of the package: the query follows the typed text after a pause. */
export function useUserSearch(): UserSearchProps {
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(text.trim())
    }, USER_SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [text])

  useEffect(() => {
    let current = true
    Promise.resolve()
      .then(() => {
        setLoading(true)
        return searchUsers(term, USER_LIMIT)
      })
      .then(
        (page) => {
          if (!current) return
          setUsers(page.items)
          setError(null)
          setLoading(false)
        },
        () => {
          if (!current) return
          setError('Не удалось загрузить пользователей')
          setLoading(false)
        },
      )
    return () => {
      current = false
    }
  }, [term, attempt])

  const onRetry = useCallback(() => {
    setAttempt((n) => n + 1)
  }, [])
  return { users, loading, error, onSearch: setText, onRetry }
}
