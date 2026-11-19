import type { InfiniteData } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedSnapshot } from '@/features/auth/auth-test-utils'
import { useSessionStore } from '@/features/auth/session.store'
import type { NotificationPage, UnreadCount } from '@/lib/backend/notifications.schema'
import { flattenNotifications, notificationsInfiniteQuery, unreadCountQuery } from '@/lib/backend/notifications.queries'
import { useChatStore } from '@/stores/chat.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useUiStore } from '@/stores/ui.store'
import { createTestQueryClient, createWrapper, installNotificationsBridgeMock, makeNotification } from './test-utils'
import { useNotificationsStream } from './use-notifications-stream'

const LIST_KEY = notificationsInfiniteQuery().queryKey
const COUNT_KEY = unreadCountQuery().queryKey

function setup() {
  const bridge = installNotificationsBridgeMock()
  const client = createTestQueryClient()
  client.setQueryData<InfiniteData<NotificationPage, number>>(LIST_KEY, {
    pages: [{ items: [makeNotification('a')], total: 1, limit: 20, page: 0 }],
    pageParams: [0]
  })
  client.setQueryData<UnreadCount>(COUNT_KEY, { unreadCount: 1 })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const hook = renderHook(() => { useNotificationsStream(); }, { wrapper: createWrapper(client) })
  return { bridge, client, invalidate, hook }
}

const listIds = (client: ReturnType<typeof createTestQueryClient>): string[] =>
  flattenNotifications(client.getQueryData(LIST_KEY)).map((notification) => notification.id)
const toastIds = (): string[] => useNotificationsStore.getState().toasts.map((toast) => toast.id)

beforeEach(() => {
  useNotificationsStore.getState().reset()
  useSessionStore.setState({ snapshot: authenticatedSnapshot })
})

afterEach(() => {
  useNotificationsStore.getState().reset()
})

describe('useNotificationsStream', () => {
  it('puts a new notification into the cache and shows a toast', () => {
    const { bridge, client } = setup()
    act(() => { bridge.emitEvent({ type: 'notification.created', notification: makeNotification('b'), unreadCount: 2 }); })
    expect(listIds(client)).toEqual(['b', 'a'])
    expect(client.getQueryData<UnreadCount>(COUNT_KEY)).toEqual({ unreadCount: 2 })
    expect(toastIds()).toEqual(['b'])
  })

  it('shows one toast and one row for a repeated delivery', () => {
    const { bridge, client } = setup()
    const event = { type: 'notification.created' as const, notification: makeNotification('b'), unreadCount: 2 }
    act(() => { bridge.emitEvent(event); })
    act(() => { bridge.emitEvent(event); })
    expect(listIds(client)).toEqual(['b', 'a'])
    expect(toastIds()).toEqual(['b'])
  })

  it('applies a read event without a toast', () => {
    const { bridge, client } = setup()
    act(() => { bridge.emitEvent({ type: 'notification.read', notificationIds: ['a'], unreadCount: 0 }); })
    expect(flattenNotifications(client.getQueryData(LIST_KEY))[0].readAt).not.toBeNull()
    expect(client.getQueryData<UnreadCount>(COUNT_KEY)).toEqual({ unreadCount: 0 })
    expect(toastIds()).toEqual([])
  })

  it('refetches notifications each time the connection comes back online', () => {
    const { bridge, invalidate } = setup()
    act(() => { bridge.emitState('connecting'); })
    act(() => { bridge.emitState('online'); })
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    act(() => { bridge.emitState('online'); })
    expect(invalidate).toHaveBeenCalledTimes(1)
    act(() => { bridge.emitState('offline'); })
    act(() => { bridge.emitState('online'); })
    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it('clears the notifications cache and toasts on logout', () => {
    const { bridge, client } = setup()
    act(() => { bridge.emitEvent({ type: 'notification.created', notification: makeNotification('b'), unreadCount: 2 }); })
    act(() => { useSessionStore.getState().setSnapshot({ state: 'unauthenticated', user: null }); })
    expect(client.getQueryData(LIST_KEY)).toBeUndefined()
    expect(client.getQueryData(COUNT_KEY)).toBeUndefined()
    expect(toastIds()).toEqual([])
  })

  it('clears the notifications cache and toasts when another user signs in', () => {
    const { bridge, client } = setup()
    act(() => { bridge.emitEvent({ type: 'notification.created', notification: makeNotification('b'), unreadCount: 2 }); })
    act(() => { useSessionStore.getState().setSnapshot({ state: 'authenticated', user: { id: 'other-user', login: 'boris' } }); }
    )
    expect(client.getQueryData(LIST_KEY)).toBeUndefined()
    expect(client.getQueryData(COUNT_KEY)).toBeUndefined()
    expect(toastIds()).toEqual([])
  })

  it('keeps the cache when the same user snapshot is refreshed', () => {
    const { client } = setup()
    act(() => { useSessionStore.getState().setSnapshot({ ...authenticatedSnapshot, warning: 'vault' }); })
    expect(listIds(client)).toEqual(['a'])
  })

  it('stops listening after unmount', () => {
    const { bridge, hook } = setup()
    expect(bridge.listenerCount()).toBe(2)
    hook.unmount()
    expect(bridge.listenerCount()).toBe(0)
  })

  describe('meeting transcript', () => {
    const transcript = (type: string, chatId: string) => ({
      type: 'notification.created' as const,
      notification: {
        ...makeNotification(`${type}-${chatId}`),
        type,
        title: 'Расшифровка готова',
        body: 'встреча-12-ноя.m4a',
        target: { type: 'chat', id: chatId }
      },
      unreadCount: 2
    })
    const HISTORY_KEY = (chatId: string) => ['threads', chatId, 'history']

    beforeEach(() => {
      useUiStore.setState({ section: 'chats' })
      useChatStore.setState({ activeThreadId: 'chat-7' })
    })

    it.each(['meeting-transcript.ready', 'meeting-transcript.failed'])(
      'refetches the history of the open chat on %s',
      (type) => {
        const { bridge, invalidate } = setup()
        act(() => { bridge.emitEvent(transcript(type, 'chat-7')); })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: HISTORY_KEY('chat-7') })
      }
    )

    it('does not show a toast for the chat the user is looking at', () => {
      const { bridge, client } = setup()
      act(() => { bridge.emitEvent(transcript('meeting-transcript.ready', 'chat-7')); })
      expect(toastIds()).toEqual([])
      expect(listIds(client)[0]).toBe('meeting-transcript.ready-chat-7')
    })

    it('shows a toast and leaves the open chat alone for another chat', () => {
      const { bridge, invalidate } = setup()
      act(() => { bridge.emitEvent(transcript('meeting-transcript.ready', 'chat-9')); })
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: HISTORY_KEY('chat-9') })
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: HISTORY_KEY('chat-7') })
      expect(toastIds()).toEqual(['meeting-transcript.ready-chat-9'])
    })

    it('shows a toast when the chat is selected but the tasks section is open', () => {
      useUiStore.setState({ section: 'tasks' })
      const { bridge, invalidate } = setup()
      act(() => { bridge.emitEvent(transcript('meeting-transcript.ready', 'chat-7')); })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: HISTORY_KEY('chat-7') })
      expect(toastIds()).toEqual(['meeting-transcript.ready-chat-7'])
    })

    it('does not touch the chat history for other notification types', () => {
      const { bridge, invalidate } = setup()
      act(() => { bridge.emitEvent({
          type: 'notification.created',
          notification: { ...makeNotification('t'), target: { type: 'chat', id: 'chat-7' } },
          unreadCount: 2
        }); }
      )
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: HISTORY_KEY('chat-7') })
    })
  })
})
