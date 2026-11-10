import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthStatus } from '@/shared/auth'
import type * as TelegramApi from '@/shared/telegram-api'
import {
  TelegramApiError,
  TelegramNetworkError,
  TelegramNotConfiguredError,
  TelegramUnauthorizedError,
  getTelegramLink,
  issueTelegramLinkToken,
  setTelegramNotifications,
  unlinkTelegram,
} from '@/shared/telegram-api'
import type { TelegramLinkStatus } from '@/shared/telegram-schema'
import { LINK_POLL_INTERVAL_MS, useTelegramLink } from './use-telegram-link'

vi.mock('@/shared/telegram-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TelegramApi>()),
  getTelegramLink: vi.fn(),
  issueTelegramLinkToken: vi.fn(),
  setTelegramNotifications: vi.fn(),
  unlinkTelegram: vi.fn(),
}))

const NOW = new Date('2026-11-11T09:00:00.000Z')
const LINK_URL = 'https://t.me/synergy_bot?start=abc'
const TTL_MS = 10 * 60 * 1000

const unlinked: TelegramLinkStatus = {
  isAvailable: true,
  isLinked: false,
  username: null,
  notificationsEnabled: false,
  linkedAt: null,
}
const linked: TelegramLinkStatus = {
  isAvailable: true,
  isLinked: true,
  username: 'ivanov_tg',
  notificationsEnabled: true,
  linkedAt: '2026-11-11T09:01:00.000Z',
}

let createTab: ReturnType<typeof vi.fn<(options: { url: string }) => Promise<object>>>

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function mount(
  status: TelegramLinkStatus = unlinked,
  authStatus: AuthStatus = 'authenticated',
) {
  vi.mocked(getTelegramLink).mockResolvedValue(status)
  const hook = renderHook(
    (props: { authStatus: AuthStatus }) => useTelegramLink(props.authStatus),
    {
      initialProps: { authStatus },
    },
  )
  await flush()
  return hook
}

async function mountWaiting() {
  vi.mocked(issueTelegramLinkToken).mockResolvedValue({
    url: LINK_URL,
    expiresAt: new Date(NOW.getTime() + TTL_MS).toISOString(),
  })
  const hook = await mount()
  await act(async () => {
    await hook.result.current.connect()
  })
  return hook
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(NOW)
  vi.mocked(getTelegramLink).mockReset()
  vi.mocked(issueTelegramLinkToken).mockReset()
  vi.mocked(setTelegramNotifications).mockReset()
  vi.mocked(unlinkTelegram).mockReset()
  createTab = vi.fn<(options: { url: string }) => Promise<object>>(() => Promise.resolve({}))
  vi.stubGlobal('chrome', { tabs: { create: createTab } })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('loading the status', () => {
  it('shows loading until the status arrives, then the unlinked state', async () => {
    const pending = deferred<TelegramLinkStatus>()
    vi.mocked(getTelegramLink).mockReturnValue(pending.promise)
    const { result } = renderHook(() => useTelegramLink('authenticated'))
    expect(result.current.state.kind).toBe('loading')
    await act(async () => {
      pending.resolve(unlinked)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.state.kind).toBe('idle')
  })

  it('shows the linked state with the status from the server', async () => {
    const { result } = await mount(linked)
    expect(result.current.state).toEqual({
      kind: 'linked',
      status: linked,
      isToggling: false,
      toggleError: null,
      unlinkError: null,
    })
  })

  it('becomes unavailable when the bot is not configured', async () => {
    const { result } = await mount({ ...unlinked, isAvailable: false })
    expect(result.current.state.kind).toBe('unavailable')
  })

  it('does not request anything without a session and offers to sign in', async () => {
    const { result } = await mount(unlinked, 'anonymous')
    expect(result.current.state.kind).toBe('signed-out')
    expect(getTelegramLink).not.toHaveBeenCalled()
  })

  it('waits while the session is being restored and loads once signed in', async () => {
    const hook = await mount(linked, 'restoring')
    expect(hook.result.current.state.kind).toBe('loading')
    expect(getTelegramLink).not.toHaveBeenCalled()
    hook.rerender({ authStatus: 'authenticated' })
    await flush()
    expect(hook.result.current.state.kind).toBe('linked')
  })

  it('treats a rejected session as signed out', async () => {
    vi.mocked(getTelegramLink).mockRejectedValue(new TelegramUnauthorizedError('Нужен вход'))
    const { result } = renderHook(() => useTelegramLink('authenticated'))
    await flush()
    expect(result.current.state.kind).toBe('signed-out')
  })

  it('reports a load failure and retries on reload', async () => {
    vi.mocked(getTelegramLink).mockRejectedValueOnce(new TelegramNetworkError('Нет связи'))
    vi.mocked(getTelegramLink).mockResolvedValue(linked)
    const { result } = renderHook(() => useTelegramLink('authenticated'))
    await flush()
    expect(result.current.state).toEqual({ kind: 'load-error', message: 'Нет связи' })
    act(() => {
      result.current.reload()
    })
    await flush()
    expect(result.current.state.kind).toBe('linked')
  })
})

describe('connecting', () => {
  it('goes through issuing to waiting and opens the link in a new tab', async () => {
    const pending = deferred<{ url: string; expiresAt: string }>()
    vi.mocked(issueTelegramLinkToken).mockReturnValue(pending.promise)
    const { result } = await mount()
    let connecting: Promise<void> = Promise.resolve()
    act(() => {
      connecting = result.current.connect()
    })
    expect(result.current.state.kind).toBe('issuing')
    await act(async () => {
      pending.resolve({ url: LINK_URL, expiresAt: new Date(NOW.getTime() + TTL_MS).toISOString() })
      await connecting
    })
    expect(result.current.state).toEqual({
      kind: 'waiting',
      url: LINK_URL,
      botUsername: 'synergy_bot',
      expiresAt: new Date(NOW.getTime() + TTL_MS).toISOString(),
    })
    expect(createTab).toHaveBeenCalledWith({ url: LINK_URL })
    expect(result.current.remainingMs).toBe(TTL_MS)
  })

  it('counts the remaining time down once a second', async () => {
    const { result } = await mountWaiting()
    await advance(1000)
    expect(result.current.remainingMs).toBe(TTL_MS - 1000)
    await advance(500)
    expect(result.current.remainingMs).toBe(TTL_MS - 1000)
    await advance(500)
    expect(result.current.remainingMs).toBe(TTL_MS - 2000)
  })

  it('polls the status every 2 seconds and shows the linked state once linked', async () => {
    const { result } = await mountWaiting()
    vi.mocked(getTelegramLink).mockClear()
    vi.mocked(getTelegramLink).mockResolvedValue(unlinked)
    await advance(LINK_POLL_INTERVAL_MS - 1)
    expect(getTelegramLink).not.toHaveBeenCalled()
    await advance(1)
    expect(getTelegramLink).toHaveBeenCalledTimes(1)
    expect(result.current.state.kind).toBe('waiting')
    vi.mocked(getTelegramLink).mockResolvedValue(linked)
    await advance(LINK_POLL_INTERVAL_MS)
    expect(result.current.state.kind).toBe('linked')
    vi.mocked(getTelegramLink).mockClear()
    await advance(LINK_POLL_INTERVAL_MS * 3)
    expect(getTelegramLink).not.toHaveBeenCalled()
  })

  it('keeps waiting when a poll fails', async () => {
    const { result } = await mountWaiting()
    vi.mocked(getTelegramLink).mockRejectedValue(new TelegramNetworkError('Нет связи'))
    await advance(LINK_POLL_INTERVAL_MS)
    expect(result.current.state.kind).toBe('waiting')
  })

  it('stops waiting and polling when the link expires', async () => {
    const { result } = await mountWaiting()
    vi.mocked(getTelegramLink).mockResolvedValue(unlinked)
    await advance(TTL_MS)
    expect(result.current.state.kind).toBe('expired')
    vi.mocked(getTelegramLink).mockClear()
    await advance(LINK_POLL_INTERVAL_MS * 3)
    expect(getTelegramLink).not.toHaveBeenCalled()
  })

  it('clears the intervals on unmount', async () => {
    const hook = await mountWaiting()
    vi.mocked(getTelegramLink).mockClear()
    hook.unmount()
    expect(vi.getTimerCount()).toBe(0)
    await advance(LINK_POLL_INTERVAL_MS * 3)
    expect(getTelegramLink).not.toHaveBeenCalled()
  })

  it('reopens the same link in a new tab', async () => {
    const { result } = await mountWaiting()
    createTab.mockClear()
    act(() => {
      result.current.reopenLink()
    })
    expect(createTab).toHaveBeenCalledWith({ url: LINK_URL })
  })

  it('cancels waiting back to the unlinked state', async () => {
    const { result } = await mountWaiting()
    act(() => {
      result.current.cancel()
    })
    expect(result.current.state.kind).toBe('idle')
    vi.mocked(getTelegramLink).mockClear()
    await advance(LINK_POLL_INTERVAL_MS * 2)
    expect(getTelegramLink).not.toHaveBeenCalled()
  })

  it('issues a new link after expiry', async () => {
    const { result } = await mountWaiting()
    await advance(TTL_MS)
    vi.setSystemTime(new Date(NOW.getTime() + TTL_MS))
    vi.mocked(issueTelegramLinkToken).mockResolvedValue({
      url: 'https://t.me/synergy_bot?start=next',
      expiresAt: new Date(NOW.getTime() + 2 * TTL_MS).toISOString(),
    })
    await act(async () => {
      await result.current.connect()
    })
    expect(result.current.state.kind).toBe('waiting')
    expect(createTab).toHaveBeenLastCalledWith({ url: 'https://t.me/synergy_bot?start=next' })
  })

  it('shows a separate state for TELEGRAM_NOT_CONFIGURED', async () => {
    vi.mocked(issueTelegramLinkToken).mockRejectedValue(
      new TelegramNotConfiguredError('Бот не настроен'),
    )
    const { result } = await mount()
    await act(async () => {
      await result.current.connect()
    })
    expect(result.current.state.kind).toBe('not-configured')
    expect(createTab).not.toHaveBeenCalled()
  })

  it('shows an error with the message when issuing fails and allows a retry', async () => {
    vi.mocked(issueTelegramLinkToken).mockRejectedValueOnce(new TelegramNetworkError('Нет связи'))
    const { result } = await mount()
    await act(async () => {
      await result.current.connect()
    })
    expect(result.current.state).toEqual({ kind: 'error', message: 'Нет связи' })
    vi.mocked(issueTelegramLinkToken).mockResolvedValue({
      url: LINK_URL,
      expiresAt: new Date(NOW.getTime() + TTL_MS).toISOString(),
    })
    await act(async () => {
      await result.current.connect()
    })
    expect(result.current.state.kind).toBe('waiting')
  })
})

describe('managing the link', () => {
  it('applies the toggle at once and keeps the server answer', async () => {
    const pending = deferred<TelegramLinkStatus>()
    vi.mocked(setTelegramNotifications).mockReturnValue(pending.promise)
    const { result } = await mount(linked)
    let toggling: Promise<void> = Promise.resolve()
    act(() => {
      toggling = result.current.toggleNotifications(false)
    })
    expect(result.current.state).toMatchObject({
      kind: 'linked',
      status: { notificationsEnabled: false },
      isToggling: true,
    })
    await act(async () => {
      pending.resolve({ ...linked, notificationsEnabled: false })
      await toggling
    })
    expect(setTelegramNotifications).toHaveBeenCalledWith(false)
    expect(result.current.state).toMatchObject({
      kind: 'linked',
      status: { notificationsEnabled: false },
      isToggling: false,
      toggleError: null,
    })
  })

  it('rolls the toggle back with an error when the server refuses', async () => {
    vi.mocked(setTelegramNotifications).mockRejectedValue(new TelegramApiError('Не сохранилось'))
    const { result } = await mount(linked)
    await act(async () => {
      await result.current.toggleNotifications(false)
    })
    expect(result.current.state).toMatchObject({
      kind: 'linked',
      status: { notificationsEnabled: true },
      isToggling: false,
      toggleError: 'Не сохранилось',
    })
  })

  it('unlinks through the unlinking state back to unlinked', async () => {
    const pending = deferred<undefined>()
    vi.mocked(unlinkTelegram).mockReturnValue(pending.promise)
    const { result } = await mount(linked)
    let unlinking: Promise<void> = Promise.resolve()
    act(() => {
      unlinking = result.current.unlink()
    })
    expect(result.current.state).toEqual({ kind: 'unlinking', status: linked })
    await act(async () => {
      pending.resolve(undefined)
      await unlinking
    })
    expect(result.current.state.kind).toBe('idle')
  })

  it('returns to the linked state with an error when unlinking fails', async () => {
    vi.mocked(unlinkTelegram).mockRejectedValue(new TelegramApiError('Не удалось отключить'))
    const { result } = await mount(linked)
    await act(async () => {
      await result.current.unlink()
    })
    expect(result.current.state).toMatchObject({
      kind: 'linked',
      status: linked,
      unlinkError: 'Не удалось отключить',
    })
  })
})
