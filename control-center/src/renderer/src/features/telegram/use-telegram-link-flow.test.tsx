/* eslint-disable @typescript-eslint/require-await -- test doubles: mocks, DOM stubs and fake transports of the test environment are typed loosely on purpose */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendError, TelegramNotConfiguredError } from '@/lib/backend/errors'
import * as telegramApi from '@/lib/backend/telegram.api'
import type { TelegramLinkStatus } from '@/lib/backend/telegram.schema'
import {
  TELEGRAM_LINK_POLL_INTERVAL_MS,
  useTelegramLinkFlow,
  type TelegramLinkFlowState
} from './use-telegram-link-flow'

vi.mock('@/lib/backend/telegram.api')

const NOW = new Date('2026-11-10T10:00:00.000Z')
const LINK_URL = 'https://t.me/synergy_tasks_bot?start=abc_DEF'

const unlinked: TelegramLinkStatus = { isAvailable: true, isLinked: false }
const linked: TelegramLinkStatus = {
  isAvailable: true,
  isLinked: true,
  username: 'ivanov_tg',
  notificationsEnabled: true,
  linkedAt: '2026-11-10T10:00:30.000Z'
}

const tokenExpiringIn = (ms: number) => ({ url: LINK_URL, expiresAt: new Date(NOW.getTime() + ms).toISOString() })

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const states: TelegramLinkFlowState[] = []
  const hook = renderHook(
    () => {
      const flow = useTelegramLinkFlow()
      states.push(flow.state)
      return flow
    },
    { wrapper }
  )
  return { client, states, ...hook }
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

let openSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  openSpy = vi.fn(() => null)
  vi.stubGlobal('open', openSpy)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useTelegramLinkFlow', () => {
  it('starts in loading and becomes idle once the status says there is no link', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    const { result, states } = setup()
    expect(states[0]).toBe('loading')
    await flush()
    expect(result.current.state).toBe('idle')
    expect(result.current.status).toEqual(unlinked)
    expect(result.current.botUsername).toBeNull()
  })

  it('is linked when the status already has a link', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linked)
    const { result } = setup()
    await flush()
    expect(result.current.state).toBe('linked')
  })

  it('reports not-configured when the bot is unavailable on the server', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue({ isAvailable: false, isLinked: false })
    const { result } = setup()
    await flush()
    expect(result.current.state).toBe('not-configured')
  })

  it('goes issuing → waiting, opens the link and takes the bot name from its url', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    let issue: (value: { url: string; expiresAt: string }) => void = () => {}
    vi.mocked(telegramApi.issueTelegramLinkToken).mockReturnValue(
      new Promise((resolve) => {
        issue = resolve
      })
    )
    const { result } = setup()
    await flush()
    act(() => { result.current.connect(); })
    expect(result.current.state).toBe('issuing')
    await act(async () => { issue(tokenExpiringIn(600_000)); })
    await flush()
    expect(result.current.state).toBe('waiting')
    expect(openSpy).toHaveBeenCalledWith(LINK_URL, '_blank', 'noopener,noreferrer')
    expect(result.current.botUsername).toBe('synergy_tasks_bot')
    expect(result.current.expiresAt).toBe(tokenExpiringIn(600_000).expiresAt)
    expect(result.current.remainingMs).toBe(600_000)
  })

  it('polls the status every 2 s while waiting and ends in linked', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(tokenExpiringIn(600_000))
    const { result } = setup()
    await flush()
    await act(async () => { result.current.connect(); })
    await flush()
    expect(result.current.state).toBe('waiting')
    const callsBefore = vi.mocked(telegramApi.getTelegramLink).mock.calls.length
    await flush(TELEGRAM_LINK_POLL_INTERVAL_MS)
    expect(vi.mocked(telegramApi.getTelegramLink).mock.calls.length).toBe(callsBefore + 1)
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linked)
    await flush(TELEGRAM_LINK_POLL_INTERVAL_MS)
    expect(result.current.state).toBe('linked')
    expect(result.current.status?.username).toBe('ivanov_tg')
    const callsAfterLink = vi.mocked(telegramApi.getTelegramLink).mock.calls.length
    await flush(TELEGRAM_LINK_POLL_INTERVAL_MS * 3)
    expect(vi.mocked(telegramApi.getTelegramLink).mock.calls.length).toBe(callsAfterLink)
  })

  it('does not poll before connect', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    setup()
    await flush()
    const calls = vi.mocked(telegramApi.getTelegramLink).mock.calls.length
    await flush(TELEGRAM_LINK_POLL_INTERVAL_MS * 3)
    expect(vi.mocked(telegramApi.getTelegramLink).mock.calls.length).toBe(calls)
  })

  it('ticks remainingMs every second from expiresAt, apart from the 2 s poll', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(tokenExpiringIn(10_000))
    const { result } = setup()
    await flush()
    await act(async () => { result.current.connect(); })
    await flush()
    expect(result.current.remainingMs).toBe(10_000)
    const calls = vi.mocked(telegramApi.getTelegramLink).mock.calls.length
    await flush(1000)
    expect(result.current.remainingMs).toBe(9000)
    expect(vi.mocked(telegramApi.getTelegramLink).mock.calls.length).toBe(calls)
    await flush(1000)
    expect(result.current.remainingMs).toBe(8000)
  })

  it('stops waiting at expiresAt with the expired state and stops polling', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(tokenExpiringIn(5000))
    const { result } = setup()
    await flush()
    await act(async () => { result.current.connect(); })
    await flush()
    await flush(5000)
    expect(result.current.state).toBe('expired')
    expect(result.current.remainingMs).toBe(0)
    const calls = vi.mocked(telegramApi.getTelegramLink).mock.calls.length
    await flush(TELEGRAM_LINK_POLL_INTERVAL_MS * 3)
    expect(vi.mocked(telegramApi.getTelegramLink).mock.calls.length).toBe(calls)
  })

  it('issues a new link from the expired state', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(tokenExpiringIn(1000))
    const { result } = setup()
    await flush()
    await act(async () => { result.current.connect(); })
    await flush(1000)
    expect(result.current.state).toBe('expired')
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(tokenExpiringIn(600_000))
    await act(async () => { result.current.connect(); })
    await flush()
    expect(result.current.state).toBe('waiting')
    expect(openSpy).toHaveBeenCalledTimes(2)
  })

  it('reopenLink opens the same link again while waiting', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(tokenExpiringIn(600_000))
    const { result } = setup()
    await flush()
    await act(async () => { result.current.connect(); })
    await flush()
    act(() => { result.current.reopenLink(); })
    expect(openSpy).toHaveBeenCalledTimes(2)
    expect(openSpy).toHaveBeenLastCalledWith(LINK_URL, '_blank', 'noopener,noreferrer')
    expect(telegramApi.issueTelegramLinkToken).toHaveBeenCalledTimes(1)
  })

  it('cancel returns to idle and stops polling', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(tokenExpiringIn(600_000))
    const { result } = setup()
    await flush()
    await act(async () => { result.current.connect(); })
    await flush()
    act(() => { result.current.cancel(); })
    expect(result.current.state).toBe('idle')
    expect(result.current.botUsername).toBeNull()
    const calls = vi.mocked(telegramApi.getTelegramLink).mock.calls.length
    await flush(TELEGRAM_LINK_POLL_INTERVAL_MS * 3)
    expect(vi.mocked(telegramApi.getTelegramLink).mock.calls.length).toBe(calls)
  })

  it('shows the error state with the message when issuing fails, and connect retries', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockRejectedValue(new BackendError('Не удалось связаться с сервером'))
    const { result } = setup()
    await flush()
    await act(async () => { result.current.connect(); })
    await flush()
    expect(result.current.state).toBe('error')
    expect(result.current.errorMessage).toBe('Не удалось связаться с сервером')
    expect(openSpy).not.toHaveBeenCalled()
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(tokenExpiringIn(600_000))
    await act(async () => { result.current.connect(); })
    await flush()
    expect(result.current.state).toBe('waiting')
    expect(result.current.errorMessage).toBeNull()
  })

  it('turns TELEGRAM_NOT_CONFIGURED on issue into its own state', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockRejectedValue(new TelegramNotConfiguredError('Бот не настроен'))
    const { result } = setup()
    await flush()
    await act(async () => { result.current.connect(); })
    await flush()
    expect(result.current.state).toBe('not-configured')
  })

  it('does not fall back to loading while polling during the wait', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    vi.mocked(telegramApi.issueTelegramLinkToken).mockResolvedValue(tokenExpiringIn(600_000))
    const { result, states } = setup()
    await flush()
    await act(async () => { result.current.connect(); })
    await flush()
    const firstWaiting = states.indexOf('waiting')
    await flush(TELEGRAM_LINK_POLL_INTERVAL_MS * 3)
    expect(vi.mocked(telegramApi.getTelegramLink).mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(states.slice(firstWaiting).every((state) => state === 'waiting')).toBe(true)
    expect(result.current.isInitialLoad).toBe(false)
  })

  it('toggleNotifications updates at once and exposes the rollback error', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linked)
    vi.mocked(telegramApi.setTelegramNotifications).mockRejectedValue(new BackendError('Не удалось изменить настройку'))
    const { result } = setup()
    await flush()
    await act(async () => { result.current.toggleNotifications(false); })
    await flush()
    expect(telegramApi.setTelegramNotifications).toHaveBeenCalledWith(false)
    expect(result.current.status?.notificationsEnabled).toBe(true)
    expect(result.current.toggleErrorMessage).toBe('Не удалось изменить настройку')
  })

  it('unlink goes through unlinking and returns to idle', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linked)
    let finish: () => void = () => {}
    vi.mocked(telegramApi.unlinkTelegram).mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      })
    )
    const { result } = setup()
    await flush()
    act(() => { result.current.unlink(); })
    await flush()
    expect(result.current.state).toBe('unlinking')
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(unlinked)
    await act(async () => { finish(); })
    await flush()
    expect(result.current.state).toBe('idle')
  })

  it('exposes the unlink error and stays linked', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockResolvedValue(linked)
    vi.mocked(telegramApi.unlinkTelegram).mockRejectedValue(new BackendError('Не удалось отключить'))
    const { result } = setup()
    await flush()
    act(() => { result.current.unlink(); })
    await flush()
    expect(result.current.state).toBe('linked')
    expect(result.current.unlinkErrorMessage).toBe('Не удалось отключить')
  })

  it('shows the error state when the status cannot be loaded', async () => {
    vi.mocked(telegramApi.getTelegramLink).mockRejectedValue(new BackendError('Сервер недоступен'))
    const { result } = setup()
    await flush()
    expect(result.current.state).toBe('error')
    expect(result.current.errorMessage).toBe('Сервер недоступен')
  })
})
