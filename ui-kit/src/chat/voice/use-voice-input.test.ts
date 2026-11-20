import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceError, type VoiceTranscriptionPort, type VoiceTranscript } from './types'
import { MAX_RECORDING_SEC, useVoiceInput } from './use-voice-input'
import { levelOf } from './voice-level'

class FakeRecorder {
  static last: FakeRecorder | null = null
  static supported = true
  static isTypeSupported(type: string) {
    return FakeRecorder.supported && type === 'audio/webm;codecs=opus'
  }
  mimeType: string
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(
    public stream: unknown,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? ''
    FakeRecorder.last = this
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['voice'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

const trackStop = vi.fn()
class FakeStream {
  getTracks() {
    return [{ stop: trackStop }]
  }
}
const getUserMedia = vi.fn()

class FakeAnalyser {
  fftSize = 0
  getByteTimeDomainData(data: Uint8Array) {
    data.fill(192)
  }
}
class FakeAudioContext {
  static closed = 0
  createMediaStreamSource() {
    return { connect: () => undefined }
  }
  createAnalyser() {
    return new FakeAnalyser()
  }
  close() {
    FakeAudioContext.closed += 1
    return Promise.resolve()
  }
}

type Deferred = { resolve: (value: VoiceTranscript) => void; reject: (error: unknown) => void; signal: AbortSignal; audio: Blob }

function fakePort(access?: 'granted' | 'denied' | 'prompt-elsewhere') {
  const calls: Deferred[] = []
  const port: VoiceTranscriptionPort = {
    transcribe: (audio, { signal }) =>
      new Promise<VoiceTranscript>((resolve, reject) => {
        calls.push({ resolve, reject, signal, audio })
      }),
    ...(access === undefined ? {} : { ensureMicrophoneAccess: () => Promise.resolve(access) }),
  }
  return { port, calls }
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeRecorder.supported = true
  FakeRecorder.last = null
  trackStop.mockClear()
  getUserMedia.mockReset()
  getUserMedia.mockImplementation(() => Promise.resolve(new FakeStream()))
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function startRecording(hook: { result: { current: ReturnType<typeof useVoiceInput> } }) {
  await act(async () => {
    await hook.result.current.start()
  })
}

describe('useVoiceInput', () => {
  it('starts idle', () => {
    const hook = renderHook(() => useVoiceInput(fakePort().port))
    expect(hook.result.current).toMatchObject({ state: 'idle', elapsedSec: 0, level: 0, error: null })
  })

  it('records as audio/webm;codecs=opus and counts the seconds', async () => {
    const hook = renderHook(() => useVoiceInput(fakePort().port))
    await startRecording(hook)
    expect(hook.result.current.state).toBe('recording')
    expect(FakeRecorder.last?.mimeType).toBe('audio/webm;codecs=opus')
    act(() => {
      vi.advanceTimersByTime(7000)
    })
    expect(hook.result.current.elapsedSec).toBe(7)
  })

  it('stop sends the record to the port, then inserts the text and goes idle', async () => {
    const { port, calls } = fakePort()
    const onTranscript = vi.fn()
    const hook = renderHook(() => useVoiceInput(port, onTranscript))
    await startRecording(hook)
    act(() => {
      hook.result.current.stop()
    })
    expect(hook.result.current.state).toBe('transcribing')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.audio.size).toBeGreaterThan(0)
    expect(trackStop).toHaveBeenCalled()
    await act(async () => {
      calls[0]?.resolve({ kind: 'text', text: ' сколько стоит MBA ' })
      await Promise.resolve()
    })
    expect(onTranscript).toHaveBeenCalledWith('сколько стоит MBA')
    expect(hook.result.current.state).toBe('idle')
  })

  it('stops by itself after 3 minutes', async () => {
    const { port, calls } = fakePort()
    const hook = renderHook(() => useVoiceInput(port))
    await startRecording(hook)
    expect(MAX_RECORDING_SEC).toBe(180)
    act(() => {
      vi.advanceTimersByTime(180_000)
    })
    expect(hook.result.current.state).toBe('transcribing')
    expect(calls).toHaveLength(1)
  })

  it('reports the level of the signal from the analyser', async () => {
    const hook = renderHook(() => useVoiceInput(fakePort().port))
    await startRecording(hook)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(hook.result.current.level).toBeGreaterThan(0)
  })

  it('no-speech is an error and the text is not inserted', async () => {
    const { port, calls } = fakePort()
    const onTranscript = vi.fn()
    const hook = renderHook(() => useVoiceInput(port, onTranscript))
    await startRecording(hook)
    act(() => {
      hook.result.current.stop()
    })
    await act(async () => {
      calls[0]?.resolve({ kind: 'no-speech' })
      await Promise.resolve()
    })
    expect(hook.result.current.state).toBe('error')
    expect(hook.result.current.error?.code).toBe('no-speech')
    expect(onTranscript).not.toHaveBeenCalled()
  })

  it.each(['VOICE_TOO_LONG', 'VOICE_TOO_LARGE', 'VOICE_RATE_LIMITED', 'VOICE_PROVIDER_UNAVAILABLE', 'VOICE_UNSUPPORTED_FORMAT'] as const)(
    'keeps the code %s of an error of the port',
    async (code) => {
      const { port, calls } = fakePort()
      const hook = renderHook(() => useVoiceInput(port))
      await startRecording(hook)
      act(() => {
        hook.result.current.stop()
      })
      await act(async () => {
        calls[0]?.reject(new VoiceError(code))
        await Promise.resolve()
      })
      expect(hook.result.current.state).toBe('error')
      expect(hook.result.current.error).toBeInstanceOf(VoiceError)
      expect(hook.result.current.error?.code).toBe(code)
    },
  )

  it('turns an unknown failure of the port into "service unavailable"', async () => {
    const { port, calls } = fakePort()
    const hook = renderHook(() => useVoiceInput(port))
    await startRecording(hook)
    act(() => {
      hook.result.current.stop()
    })
    await act(async () => {
      calls[0]?.reject(new TypeError('Failed to fetch'))
      await Promise.resolve()
    })
    expect(hook.result.current.error?.code).toBe('VOICE_PROVIDER_UNAVAILABLE')
  })

  it('microphone-denied when getUserMedia is refused: nothing is recorded', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const hook = renderHook(() => useVoiceInput(fakePort().port))
    await startRecording(hook)
    expect(hook.result.current.state).toBe('error')
    expect(hook.result.current.error?.code).toBe('microphone-denied')
    expect(FakeRecorder.last).toBeNull()
  })

  it('microphone-denied when the port reports a refusal before recording', async () => {
    const hook = renderHook(() => useVoiceInput(fakePort('denied').port))
    await startRecording(hook)
    expect(hook.result.current.error?.code).toBe('microphone-denied')
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('does not record while the permission is asked on another page', async () => {
    const hook = renderHook(() => useVoiceInput(fakePort('prompt-elsewhere').port))
    await startRecording(hook)
    expect(hook.result.current.state).toBe('idle')
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('starting again clears the error', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    const hook = renderHook(() => useVoiceInput(fakePort().port))
    await startRecording(hook)
    await startRecording(hook)
    expect(hook.result.current.state).toBe('recording')
    expect(hook.result.current.error).toBeNull()
  })

  it('cancel drops the record without a request', async () => {
    const { port, calls } = fakePort()
    const hook = renderHook(() => useVoiceInput(port))
    await startRecording(hook)
    act(() => {
      hook.result.current.cancel()
    })
    expect(hook.result.current.state).toBe('idle')
    expect(calls).toHaveLength(0)
    expect(trackStop).toHaveBeenCalled()
  })

  it('cancel aborts the request while it is being transcribed', async () => {
    const { port, calls } = fakePort()
    const onTranscript = vi.fn()
    const hook = renderHook(() => useVoiceInput(port, onTranscript))
    await startRecording(hook)
    act(() => {
      hook.result.current.stop()
    })
    act(() => {
      hook.result.current.cancel()
    })
    expect(calls[0]?.signal.aborted).toBe(true)
    expect(hook.result.current.state).toBe('idle')
    await act(async () => {
      calls[0]?.resolve({ kind: 'text', text: 'поздно' })
      await Promise.resolve()
    })
    expect(onTranscript).not.toHaveBeenCalled()
  })

  it('aborts the request and releases the microphone on unmount', async () => {
    const { port, calls } = fakePort()
    const hook = renderHook(() => useVoiceInput(port))
    await startRecording(hook)
    act(() => {
      hook.result.current.stop()
    })
    hook.unmount()
    expect(calls[0]?.signal.aborted).toBe(true)

    const second = renderHook(() => useVoiceInput(fakePort().port))
    await startRecording(second)
    trackStop.mockClear()
    second.unmount()
    expect(trackStop).toHaveBeenCalled()
    expect(FakeAudioContext.closed).toBeGreaterThan(0)
  })
})

describe('levelOf', () => {
  it('is 0 for silence and grows with the amplitude', () => {
    expect(levelOf(new Uint8Array(8).fill(128))).toBe(0)
    const quiet = levelOf(new Uint8Array(8).fill(138))
    const loud = levelOf(new Uint8Array(8).fill(200))
    expect(quiet).toBeGreaterThan(0)
    expect(loud).toBeGreaterThan(quiet)
    expect(loud).toBeLessThanOrEqual(1)
  })
  it('is 0 without samples', () => {
    expect(levelOf(new Uint8Array(0))).toBe(0)
  })
})
