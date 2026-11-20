import { VoiceError } from '@synergy/ui-kit'
import type { VoiceErrorCode, VoiceTranscript } from '@synergy/ui-kit'
import { isRecord } from './api'
import { authFetch } from './auth/auth-fetch'
import { withClientApp } from './client-app'
import { getBackendUrl } from './settings'

const SERVER_CODES: readonly VoiceErrorCode[] = [
  'VOICE_AUDIO_REQUIRED',
  'VOICE_TOO_LARGE',
  'VOICE_TOO_LONG',
  'VOICE_UNSUPPORTED_FORMAT',
  'VOICE_RATE_LIMITED',
  'VOICE_PROVIDER_UNAVAILABLE',
]

async function errorCode(response: Response): Promise<VoiceErrorCode> {
  try {
    const body: unknown = await response.json()
    if (isRecord(body)) {
      const found = SERVER_CODES.find((code) => code === body.code)
      if (found !== undefined) return found
    }
  } catch {
    // the body is not JSON: the service counts as unavailable
  }
  return 'VOICE_PROVIDER_UNAVAILABLE'
}

/** Sends a record to `POST /transcriptions/voice`; server codes become `VoiceError`. */
export async function transcribeVoice(
  audio: Blob,
  options: { signal: AbortSignal },
): Promise<VoiceTranscript> {
  const baseUrl = await getBackendUrl()
  const form = new FormData()
  form.append('audio', audio, 'voice.webm')
  let response: Response
  try {
    response = await authFetch(
      `${baseUrl}/transcriptions/voice`,
      withClientApp({ method: 'POST', body: form, signal: options.signal }),
    )
  } catch (error) {
    if (options.signal.aborted) throw error
    throw new VoiceError('VOICE_PROVIDER_UNAVAILABLE')
  }
  if (!response.ok) {
    const code = await errorCode(response)
    const retryAfter = Number(response.headers.get('Retry-After'))
    throw new VoiceError(code, {
      retryAfterSec: code === 'VOICE_RATE_LIMITED' && retryAfter > 0 ? retryAfter : undefined,
    })
  }
  const body: unknown = await response.json()
  if (isRecord(body) && body.kind === 'no-speech') return { kind: 'no-speech' }
  if (isRecord(body) && body.kind === 'text' && typeof body.text === 'string') {
    return { kind: 'text', text: body.text }
  }
  throw new VoiceError('VOICE_PROVIDER_UNAVAILABLE')
}
