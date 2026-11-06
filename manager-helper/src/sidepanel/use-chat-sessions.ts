import { useCallback, useEffect, useRef, useState } from 'react'
import { getActiveSessionId, setActiveSessionId } from '@/shared/active-session'
import { createThread, deleteThread, listThreads, renameThread } from '@/shared/threads-api'
import type { Thread } from '@/shared/threads-api'

export type SessionsStatus = 'loading' | 'ready' | 'error'

function byFreshness(sessions: Thread[]): Thread[] {
  return [...sessions].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<Thread[]>([])
  const [status, setStatus] = useState<SessionsStatus>('loading')
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeRef = useRef<string | null>(null)
  const loaded = useRef(false)
  /** Chats created / removed locally; a list fetched before them must not undo them. */
  const createdLog = useRef<Thread[]>([])
  const removedLog = useRef<string[]>([])

  const activate = useCallback((id: string | null) => {
    activeRef.current = id
    setActiveId(id)
    void setActiveSessionId(id)
  }, [])

  const load = useCallback(async () => {
    const startedWith = activeRef.current
    const createdMark = createdLog.current.length
    const removedMark = removedLog.current.length
    try {
      const [list, stored] = await Promise.all([listThreads(), getActiveSessionId()])
      const created = createdLog.current.slice(createdMark)
      const removed = removedLog.current.slice(removedMark)
      const merged = [
        ...created.filter((c) => !list.some((s) => s.id === c.id)),
        ...list.filter((s) => !removed.includes(s.id)),
      ]
      const fresh = byFreshness(merged)
      if (activeRef.current !== startedWith) {
        // The user switched, created or removed a chat while the list was loading: keep their choice.
        loaded.current = true
        setSessions(fresh)
        setStatus('ready')
        return
      }
      const wanted = activeRef.current ?? stored
      const next = fresh.some((s) => s.id === wanted) ? wanted : (fresh[0]?.id ?? null)
      loaded.current = true
      setSessions(fresh)
      setStatus('ready')
      if (next !== activeRef.current) activate(next)
      else setActiveId(next)
    } catch {
      setStatus(loaded.current ? 'ready' : 'error')
    }
  }, [activate])

  useEffect(() => {
    Promise.resolve().then(load, load)
  }, [load])

  const reload = useCallback(async () => {
    if (!loaded.current) setStatus('loading')
    await load()
  }, [load])

  const select = useCallback(
    (id: string) => {
      activate(id)
    },
    [activate],
  )

  const create = useCallback(
    async (title?: string) => {
      const created = await createThread(title)
      createdLog.current.push(created)
      setSessions((current) => [created, ...current.filter((s) => s.id !== created.id)])
      activate(created.id)
      return created
    },
    [activate],
  )

  const rename = useCallback(async (id: string, title: string) => {
    const updated = await renameThread(id, title)
    setSessions((current) => current.map((s) => (s.id === id ? updated : s)))
    return updated
  }, [])

  const remove = useCallback(
    async (id: string) => {
      await deleteThread(id)
      removedLog.current.push(id)
      const remaining = sessions.filter((s) => s.id !== id)
      setSessions(remaining)
      if (activeRef.current === id) activate(remaining[0]?.id ?? null)
    },
    [sessions, activate],
  )

  return { sessions, status, activeId, select, create, rename, remove, reload }
}
