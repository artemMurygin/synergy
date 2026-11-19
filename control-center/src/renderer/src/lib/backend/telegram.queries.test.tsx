/* eslint-disable @typescript-eslint/no-deprecated, @typescript-eslint/require-await -- test doubles: mocks, DOM stubs and fake transports of the test environment are typed loosely on purpose */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendError } from './errors'
import * as telegramApi from './telegram.api'
import type { TelegramLinkStatus } from './telegram.schema'
import {
  TELEGRAM_LINK_KEY,
  telegramLinkQuery,
  useIssueTelegramLinkToken,
  useSetTelegramNotifications,
  useUnlinkTelegram
} from './telegram.queries'

vi.mock('./telegram.api')

const linked: TelegramLinkStatus = {
  isAvailable: true,
  isLinked: true,
  username: 'ivanov_tg',
  notificationsEnabled: true,
  linkedAt: '2026-11-10T10:00:00.000Z'
}
const unlinked: TelegramLinkStatus = { isAvailable: true, isLinked: false }

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const statusOf = (client: QueryClient) => client.getQueryData<TelegramLinkStatus>(TELEGRAM_LINK_KEY)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('telegramLinkQuery', () => {
  it('loads the status under the telegram link key without polling by default', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linked)
    const options = telegramLinkQuery()
    expect(options.queryKey).toEqual(['telegram', 'link'])
    expect(options.refetchInterval).toBeUndefined()
    const { client } = setup()
    await expect(client.fetchQuery(options)).resolves.toEqual(linked)
  })

  it('passes the refetch interval while waiting for the link', () => {
    expect(telegramLinkQuery({ refetchInterval: 2000 }).refetchInterval).toBe(2000)
    expect(telegramLinkQuery({ refetchInterval: false }).refetchInterval).toBe(false)
  })
})

describe('useIssueTelegramLinkToken', () => {
  it('issues the link and returns url and expiry', async () => {
    const token = { url: 'https://t.me/bot?start=a', expiresAt: '2026-11-10T10:10:00.000Z' }
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(token)
    const { wrapper } = setup()
    const { result } = renderHook(() => useIssueTelegramLinkToken(), { wrapper })
    let issued: unknown = null
    await act(async () => {
      issued = await result.current.mutateAsync()
    })
    expect(issued).toEqual(token)
  })
})

describe('useSetTelegramNotifications', () => {
  it('shows the new value at once and keeps the server answer', async () => {
    const answer = deferred<TelegramLinkStatus>()
    vi.mocked(telegramApi.setTelegramNotifications).mockReturnValue(answer.promise)
    const { client, wrapper } = setup()
    client.setQueryData(TELEGRAM_LINK_KEY, linked)
    const { result } = renderHook(() => useSetTelegramNotifications(), { wrapper })
    act(() => { result.current.mutate(false); })
    await waitFor(() => { expect(statusOf(client)?.notificationsEnabled).toBe(false); })
    expect(telegramApi.setTelegramNotifications).toHaveBeenCalledWith(false)
    await act(async () => { answer.resolve({ ...linked, notificationsEnabled: false, username: 'renamed' }); })
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); })
    expect(statusOf(client)).toEqual({ ...linked, notificationsEnabled: false, username: 'renamed' })
  })

  it('rolls back to the previous value when the server refuses', async () => {
    const answer = deferred<TelegramLinkStatus>()
    vi.mocked(telegramApi.setTelegramNotifications).mockReturnValue(answer.promise)
    const { client, wrapper } = setup()
    client.setQueryData(TELEGRAM_LINK_KEY, linked)
    const { result } = renderHook(() => useSetTelegramNotifications(), { wrapper })
    act(() => { result.current.mutate(false); })
    await waitFor(() => { expect(statusOf(client)?.notificationsEnabled).toBe(false); })
    await act(async () => { answer.reject(new BackendError('Не удалось')); })
    await waitFor(() => { expect(result.current.isError).toBe(true); })
    expect(statusOf(client)?.notificationsEnabled).toBe(true)
    expect(result.current.error?.message).toBe('Не удалось')
  })
})

describe('useUnlinkTelegram', () => {
  it('invalidates the status so it is fetched again', async () => {
    vi.mocked(telegramApi.unlinkTelegram).mockResolvedValue(undefined)
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    const { client, wrapper } = setup()
    client.setQueryData(TELEGRAM_LINK_KEY, linked)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUnlinkTelegram(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync()
    })
    expect(telegramApi.unlinkTelegram).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: TELEGRAM_LINK_KEY })
    expect(statusOf(client)?.isLinked).toBe(false)
  })

  it('keeps the status when the unlink fails', async () => {
    vi.mocked(telegramApi.unlinkTelegram).mockRejectedValue(new BackendError('Ошибка'))
    const { client, wrapper } = setup()
    client.setQueryData(TELEGRAM_LINK_KEY, linked)
    const { result } = renderHook(() => useUnlinkTelegram(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined)
    })
    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(statusOf(client)).toEqual(linked)
  })
})
