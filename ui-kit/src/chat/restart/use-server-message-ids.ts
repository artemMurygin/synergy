import { useCallback, useMemo, useRef, useState } from 'react'

/** Name of the AG-UI `CUSTOM` event with the server id of the saved question. */
export const USER_MESSAGE_SAVED_EVENT = 'user-message-saved'

export type HistoryMessageRef = {
  id: string
  role?: string
  /** Only for the user messages: whether the server can restart the chat from the message. */
  editable?: boolean
}

export type ServerMessageIds = {
  /** Server id of a message of the feed: from the event or from the history; `undefined` when unknown. */
  serverIdOf: (localId: string) => string | undefined
  /** "Изменить" is allowed: the server id is known and the history did not mark it `editable: false`. */
  isEditable: (id: string) => boolean
  /** Feed an AG-UI `CUSTOM` event with the local id of the message that started the run. */
  onCustomEvent: (event: { name: string; value?: unknown }, localId: string) => void
  /** Replaces what is known from the history. */
  setFromHistory: (messages: readonly HistoryMessageRef[]) => void
}

/** Matches local ids of the feed to server ids and tells which messages can be edited. */
export function useServerMessageIds(): ServerMessageIds {
  const fromEvents = useRef(new Map<string, string>())
  const historyIds = useRef(new Set<string>())
  const locked = useRef(new Set<string>())
  const [version, setVersion] = useState(0)

  const serverIdOf = useCallback((localId: string): string | undefined => {
    const mapped = fromEvents.current.get(localId)
    if (mapped !== undefined) return mapped
    return historyIds.current.has(localId) ? localId : undefined
  }, [])

  const isEditable = useCallback(
    (id: string): boolean => {
      const serverId = serverIdOf(id)
      return serverId !== undefined && !locked.current.has(serverId)
    },
    [serverIdOf],
  )

  const onCustomEvent = useCallback((event: { name: string; value?: unknown }, localId: string) => {
    if (event.name !== USER_MESSAGE_SAVED_EVENT) return
    const value = event.value
    if (typeof value !== 'object' || value === null || !('messageId' in value)) return
    const messageId = value.messageId
    if (typeof messageId !== 'string' && typeof messageId !== 'number') return
    fromEvents.current.set(localId, String(messageId))
    setVersion((v) => v + 1)
  }, [])

  const setFromHistory = useCallback((messages: readonly HistoryMessageRef[]) => {
    historyIds.current = new Set(messages.filter((m) => m.role === 'user').map((m) => m.id))
    locked.current = new Set(messages.filter((m) => m.role === 'user' && m.editable === false).map((m) => m.id))
    setVersion((v) => v + 1)
  }, [])

  return useMemo(
    () => ({ serverIdOf, isEditable, onCustomEvent, setFromHistory }),
    // The version is part of the identity: consumers re-render when the knowledge changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverIdOf, isEditable, onCustomEvent, setFromHistory, version],
  )
}
