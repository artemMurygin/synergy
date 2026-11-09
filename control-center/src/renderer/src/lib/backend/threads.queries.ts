import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { ThreadNotFoundError } from './errors'
import type { Thread } from './schema'
import { createThread, deleteThread, listThreads, renameThread } from './threads.api'
import { useChatStore } from '@/stores/chat.store'

const THREADS_KEY = ['threads'] as const

export const threadsQuery = () =>
  queryOptions({
    queryKey: THREADS_KEY,
    queryFn: listThreads
  })

export function useCreateThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => createThread(),
    onSuccess: async (thread) => {
      useChatStore.getState().setActiveThread(thread.id)
      await queryClient.invalidateQueries({ queryKey: THREADS_KEY })
    }
  })
}

export function useRenameThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameThread(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: THREADS_KEY })
  })
}

/** Next thread in the list, else the previous one, else null. */
function neighbourOf(list: Thread[], id: string): string | null {
  const index = list.findIndex((thread) => thread.id === id)
  if (index === -1) return list[0]?.id ?? null
  return (list[index + 1] ?? list[index - 1])?.id ?? null
}

export function useDeleteThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await deleteThread(id)
      } catch (error) {
        // 404: the thread is already gone, which is the desired outcome
        if (!(error instanceof ThreadNotFoundError)) throw error
      }
    },
    onSuccess: async (_data, id) => {
      const { activeThreadId, setActiveThread } = useChatStore.getState()
      if (activeThreadId === id) {
        const cached = queryClient.getQueryData<Thread[]>(THREADS_KEY) ?? []
        setActiveThread(neighbourOf(cached, id))
      }
      await queryClient.invalidateQueries({ queryKey: THREADS_KEY })
    }
  })
}
