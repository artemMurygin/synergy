import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat.store'
import { useSessionStore } from './session.store'

export function useSessionReset(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    return useSessionStore.subscribe((current, previous) => {
      const isLoggedOut =
        current.snapshot.state === 'unauthenticated' &&
        previous.snapshot.state !== 'unauthenticated'
      if (!isLoggedOut) return
      queryClient.clear()
      useChatStore.getState().setActiveThread(null)
    })
  }, [queryClient])
}
