import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { transcribeVoice } from '@/shared/voice-api'
import { useVoiceTranscriptionPort } from './use-voice-transcription-port'

vi.mock('@/shared/voice-api')

const create = vi.fn()

function stubPermission(state: PermissionState | 'throws') {
  const query =
    state === 'throws'
      ? vi.fn().mockRejectedValue(new TypeError('unsupported'))
      : vi.fn().mockResolvedValue({ state })
  Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true })
  return query
}

beforeEach(() => {
  create.mockResolvedValue({})
  vi.stubGlobal('chrome', {
    tabs: { create },
    runtime: { getURL: (path: string) => `chrome-extension://id/${path}` },
  })
})

afterEach(() => {
  create.mockReset()
  vi.unstubAllGlobals()
})

describe('useVoiceTranscriptionPort', () => {
  it('delegates transcribe to the voice api', async () => {
    vi.mocked(transcribeVoice).mockResolvedValue({ kind: 'text', text: 'привет' })
    const { result } = renderHook(() => useVoiceTranscriptionPort())
    const blob = new Blob(['x'])
    const signal = new AbortController().signal
    await expect(result.current.transcribe(blob, { signal })).resolves.toEqual({
      kind: 'text',
      text: 'привет',
    })
    expect(transcribeVoice).toHaveBeenCalledWith(blob, { signal })
  })

  it('is granted without opening a tab when the permission is already given', async () => {
    stubPermission('granted')
    const { result } = renderHook(() => useVoiceTranscriptionPort())
    await expect(result.current.ensureMicrophoneAccess?.()).resolves.toBe('granted')
    expect(create).not.toHaveBeenCalled()
  })

  it('is denied when the permission is denied', async () => {
    stubPermission('denied')
    const { result } = renderHook(() => useVoiceTranscriptionPort())
    await expect(result.current.ensureMicrophoneAccess?.()).resolves.toBe('denied')
    expect(create).not.toHaveBeenCalled()
  })

  it('opens mic-permission.html in a tab and answers prompt-elsewhere on "prompt"', async () => {
    stubPermission('prompt')
    const { result } = renderHook(() => useVoiceTranscriptionPort())
    await expect(result.current.ensureMicrophoneAccess?.()).resolves.toBe('prompt-elsewhere')
    expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://id/src/mic-permission/index.html' })
  })

  it('asks on the page too when the Permissions API cannot answer', async () => {
    stubPermission('throws')
    const { result } = renderHook(() => useVoiceTranscriptionPort())
    await expect(result.current.ensureMicrophoneAccess?.()).resolves.toBe('prompt-elsewhere')
    expect(create).toHaveBeenCalledTimes(1)
  })
})
