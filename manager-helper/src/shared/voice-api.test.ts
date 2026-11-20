import { VoiceError } from '@synergy/ui-kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccessToken, setAccessToken } from './auth/access-token-store'
import { resetAuthState } from './auth/auth-state'
import { transcribeVoice } from './voice-api'

vi.mock('./settings', () => ({ getBackendUrl: () => Promise.resolve('http://api.test') }))

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

async function failure(promise: Promise<unknown>): Promise<VoiceError> {
  const error = await promise.catch((e: unknown) => e)
  if (!(error instanceof VoiceError)) throw new Error('expected a VoiceError')
  return error
}

const blob = () => new Blob(['x'], { type: 'audio/webm' })
const signal = () => new AbortController().signal

beforeEach(() => {
  setAccessToken('tok')
})

afterEach(() => {
  clearAccessToken()
  resetAuthState()
  vi.restoreAllMocks()
})

describe('transcribeVoice', () => {
  it('posts the record as multipart field "audio" with the client header and returns the text', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ kind: 'text', text: 'привет' }))
    const result = await transcribeVoice(blob(), { signal: signal() })
    expect(result).toEqual({ kind: 'text', text: 'привет' })
    const url = fetchMock.mock.calls[0]?.[0]
    const init = fetchMock.mock.calls[0]?.[1]
    expect(url).toBe('http://api.test/transcriptions/voice')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
    const body = init?.body
    if (!(body instanceof FormData)) throw new Error('expected multipart body')
    expect(body.get('audio')).toBeInstanceOf(Blob)
    const headers = new Headers(init?.headers)
    expect(headers.get('X-Client-App')).toBe('employee-app')
    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('returns no-speech as is', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ kind: 'no-speech' }))
    expect(await transcribeVoice(blob(), { signal: signal() })).toEqual({ kind: 'no-speech' })
  })

  it.each([
    [400, 'VOICE_AUDIO_REQUIRED'],
    [413, 'VOICE_TOO_LARGE'],
    [413, 'VOICE_TOO_LONG'],
    [415, 'VOICE_UNSUPPORTED_FORMAT'],
    [503, 'VOICE_PROVIDER_UNAVAILABLE'],
  ])('maps HTTP %i with code %s to VoiceError', async (status, code) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ statusCode: status, code, message: 'm' }, status))
    const error = await failure(transcribeVoice(blob(), { signal: signal() }))
    expect(error.code).toBe(code)
  })

  it('carries Retry-After of the rate limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ code: 'VOICE_RATE_LIMITED', message: 'm' }, 429, { 'Retry-After': '17' }),
    )
    const error = await failure(transcribeVoice(blob(), { signal: signal() }))
    expect(error.code).toBe('VOICE_RATE_LIMITED')
    expect(error.retryAfterSec).toBe(17)
  })

  it('treats an unknown failure as the provider being unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }))
    const error = await failure(transcribeVoice(blob(), { signal: signal() }))
    expect(error.code).toBe('VOICE_PROVIDER_UNAVAILABLE')
  })
})
