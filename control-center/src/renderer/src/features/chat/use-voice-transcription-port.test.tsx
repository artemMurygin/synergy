import { VoiceError } from '@synergy/ui-kit'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceTranscriptionPort } from './use-voice-transcription-port'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const clip = () => new Blob(['x'], { type: 'audio/webm' })
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

function port() {
  return renderHook(() => useVoiceTranscriptionPort()).result.current
}

describe('useVoiceTranscriptionPort', () => {
  it('sends the record as multipart field audio to the voice endpoint', async () => {
    fetchMock.mockResolvedValue(json(200, { kind: 'text', text: 'Привет' }))
    const result = await port().transcribe(clip(), { signal: new AbortController().signal })
    expect(result).toEqual({ kind: 'text', text: 'Привет' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('cc-api://backend/transcriptions/voice')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('audio')).toBeInstanceOf(Blob)
  })

  it('passes "no speech" through', async () => {
    fetchMock.mockResolvedValue(json(200, { kind: 'no-speech' }))
    expect(await port().transcribe(clip(), { signal: new AbortController().signal })).toEqual({ kind: 'no-speech' })
  })

  it.each([
    [413, 'VOICE_TOO_LARGE'],
    [413, 'VOICE_TOO_LONG'],
    [415, 'VOICE_UNSUPPORTED_FORMAT'],
    [400, 'VOICE_AUDIO_REQUIRED'],
    [503, 'VOICE_PROVIDER_UNAVAILABLE']
  ])('maps %s %s to VoiceError', async (status, code) => {
    fetchMock.mockResolvedValue(json(status, { code, message: 'm' }))
    await expect(port().transcribe(clip(), { signal: new AbortController().signal })).rejects.toMatchObject({
      name: 'VoiceError',
      code
    })
  })

  it('keeps Retry-After of the rate limit', async () => {
    fetchMock.mockResolvedValue(json(429, { code: 'VOICE_RATE_LIMITED' }, { 'retry-after': '17' }))
    const error = await port()
      .transcribe(clip(), { signal: new AbortController().signal })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(VoiceError)
    expect(error).toMatchObject({ code: 'VOICE_RATE_LIMITED', retryAfterSec: 17 })
  })

  it('reports an unreachable server as provider unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(port().transcribe(clip(), { signal: new AbortController().signal })).rejects.toMatchObject({
      code: 'VOICE_PROVIDER_UNAVAILABLE'
    })
  })

  it('lets an abort through unchanged', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(() => {
      controller.abort()
      return Promise.reject(new DOMException('aborted', 'AbortError'))
    })
    await expect(port().transcribe(clip(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
