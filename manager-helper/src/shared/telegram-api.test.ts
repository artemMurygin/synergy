import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from './auth/access-token-store'
import { resetAuthState } from './auth/auth-state'
import {
  TelegramApiError,
  TelegramNetworkError,
  TelegramNotConfiguredError,
  TelegramNotLinkedError,
  TelegramRateLimitedError,
  TelegramUnauthorizedError,
  getTelegramLink,
  issueTelegramLinkToken,
  setTelegramNotifications,
  unlinkTelegram,
} from './telegram-api'

vi.mock('./settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

const linked = {
  isAvailable: true,
  isLinked: true,
  username: 'ivanov_tg',
  notificationsEnabled: true,
  linkedAt: '2026-11-11T09:00:00.000Z',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type Sender = (url: string, init?: RequestInit) => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn<Sender>>

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch was not called')
  return { url: call[0], init: call[1] ?? {} }
}

beforeEach(() => {
  fetchMock = vi.fn<Sender>()
  vi.stubGlobal('fetch', fetchMock)
  setAccessToken('tok')
})
afterEach(() => {
  clearAccessToken()
  resetAuthState()
  vi.unstubAllGlobals()
})

describe('getTelegramLink', () => {
  it('requests the status through authFetch and parses it', async () => {
    fetchMock.mockResolvedValue(json(linked))
    expect(await getTelegramLink()).toEqual(linked)
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/telegram/link')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok')
  })

  it('rejects a response of an unexpected shape', async () => {
    fetchMock.mockResolvedValue(json({ isLinked: 'yes' }))
    await expect(getTelegramLink()).rejects.toBeInstanceOf(TelegramApiError)
  })

  it('reports an unreachable server as a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const failure = getTelegramLink()
    await expect(failure).rejects.toBeInstanceOf(TelegramNetworkError)
    await expect(failure).rejects.toThrow('http://api.test')
  })

  it('reports a rejected session as unauthorized', async () => {
    fetchMock.mockResolvedValue(json({ code: 'UNAUTHORIZED', message: 'Нужен вход' }, 401))
    await expect(getTelegramLink()).rejects.toBeInstanceOf(TelegramUnauthorizedError)
  })
})

describe('issueTelegramLinkToken', () => {
  it('posts to the link-token endpoint and returns the link', async () => {
    const token = {
      url: 'https://t.me/synergy_bot?start=abc',
      expiresAt: '2026-11-11T09:10:00.000Z',
    }
    fetchMock.mockResolvedValue(json(token, 201))
    expect(await issueTelegramLinkToken()).toEqual(token)
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/telegram/link-token')
    expect(init.method).toBe('POST')
  })

  it('maps 503 TELEGRAM_NOT_CONFIGURED to its own error', async () => {
    fetchMock.mockResolvedValue(
      json({ code: 'TELEGRAM_NOT_CONFIGURED', message: 'Бот не настроен' }, 503),
    )
    await expect(issueTelegramLinkToken()).rejects.toBeInstanceOf(TelegramNotConfiguredError)
  })

  it('maps 429 to a rate-limit error with a readable message', async () => {
    fetchMock.mockResolvedValue(json({ message: 'ThrottlerException: Too Many Requests' }, 429))
    const failure = issueTelegramLinkToken()
    await expect(failure).rejects.toBeInstanceOf(TelegramRateLimitedError)
    await expect(failure).rejects.toThrow('Слишком много попыток')
  })

  it('keeps the server message for other failures', async () => {
    fetchMock.mockResolvedValue(json({ code: 'INTERNAL', message: 'Сломалось' }, 500))
    const failure = issueTelegramLinkToken()
    await expect(failure).rejects.toBeInstanceOf(TelegramApiError)
    await expect(failure).rejects.toThrow('Сломалось')
  })
})

describe('setTelegramNotifications', () => {
  it('patches the flag as JSON and returns the new status', async () => {
    fetchMock.mockResolvedValue(json({ ...linked, notificationsEnabled: false }))
    const status = await setTelegramNotifications(false)
    expect(status.notificationsEnabled).toBe(false)
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/telegram/link')
    expect(init.method).toBe('PATCH')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ notificationsEnabled: false }))
  })

  it('maps 404 TELEGRAM_NOT_LINKED to its own error', async () => {
    fetchMock.mockResolvedValue(json({ code: 'TELEGRAM_NOT_LINKED', message: 'Нет привязки' }, 404))
    await expect(setTelegramNotifications(true)).rejects.toBeInstanceOf(TelegramNotLinkedError)
  })
})

describe('unlinkTelegram', () => {
  it('sends DELETE and accepts 204 without a body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(unlinkTelegram()).resolves.toBeUndefined()
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/telegram/link')
    expect(init.method).toBe('DELETE')
  })

  it('fails on a server error', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Сломалось' }, 500))
    await expect(unlinkTelegram()).rejects.toBeInstanceOf(TelegramApiError)
  })
})
