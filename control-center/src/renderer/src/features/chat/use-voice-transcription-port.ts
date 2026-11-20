import { VoiceError, type VoiceErrorCode, type VoiceTranscript, type VoiceTranscriptionPort } from '@synergy/ui-kit'
import { BackendError } from '@/lib/backend/errors'
import { errorCode, fetchBackend } from '@/lib/backend/client'

const SERVER_CODES: readonly VoiceErrorCode[] = [
  'VOICE_AUDIO_REQUIRED',
  'VOICE_TOO_LARGE',
  'VOICE_TOO_LONG',
  'VOICE_UNSUPPORTED_FORMAT',
  'VOICE_RATE_LIMITED',
  'VOICE_PROVIDER_UNAVAILABLE'
]

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function parseTranscript(body: unknown): VoiceTranscript {
  if (typeof body === 'object' && body !== null && 'kind' in body) {
    if (body.kind === 'no-speech') return { kind: 'no-speech' }
    if (body.kind === 'text' && 'text' in body && typeof body.text === 'string') return { kind: 'text', text: body.text }
  }
  throw new VoiceError('VOICE_PROVIDER_UNAVAILABLE')
}

// The port is stateless: one object for the whole app, so the hook returns a stable value
const port: VoiceTranscriptionPort = {
  async transcribe(audio, { signal }) {
    const form = new FormData()
    form.append('audio', audio, 'voice.webm')
    let response: Response
    try {
      response = await fetchBackend('/transcriptions/voice', { method: 'POST', body: form, signal })
    } catch (error) {
      if (isAbort(error)) throw error
      // fetchBackend turns every failure into BackendError: a cancelled request is not "unavailable"
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (error instanceof BackendError) throw new VoiceError('VOICE_PROVIDER_UNAVAILABLE')
      throw error
    }
    if (response.ok) return parseTranscript(await response.json())
    const code = await errorCode(response)
    const known = SERVER_CODES.find((candidate) => candidate === code)
    if (known === undefined) throw new VoiceError('VOICE_PROVIDER_UNAVAILABLE')
    const retryAfter = Number(response.headers.get('retry-after'))
    throw new VoiceError(known, Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSec: retryAfter } : undefined)
  }
}

/** Voice input over `cc-api://backend/transcriptions/voice`; the microphone permission is granted in the main process. */
export function useVoiceTranscriptionPort(): VoiceTranscriptionPort {
  return port
}
