import { queryOptions, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ThreadNotFoundError } from '@/lib/backend/errors'
import { getThreadHistory } from '@/lib/backend/threads.api'
import { useChatStore } from '@/stores/chat.store'

// The key includes threadId, so a late response for a previous chat lands in its own cache entry.
export const threadHistoryOptions = (threadId: string | null) =>
  queryOptions({
    queryKey: ['threads', threadId, 'history'],
    queryFn: () => getThreadHistory(threadId as string),
    enabled: threadId !== null,
    retry: false,
    refetchOnWindowFocus: false
  })

export function useThreadHistory(threadId: string | null) {
  const query = useQuery(threadHistoryOptions(threadId))
  const setActiveThread = useChatStore((s) => s.setActiveThread)
  const notFound = query.error instanceof ThreadNotFoundError

  useEffect(() => {
    if (notFound && useChatStore.getState().activeThreadId === threadId) setActiveThread(null)
  }, [notFound, threadId, setActiveThread])

  return {
    messages: query.data?.messages ?? [],
    running: query.data?.running ?? false,
    isInitialLoad: threadId !== null && query.isPending,
    error: query.error,
    refetch: query.refetch
  }
}
