/** Result of the transcription: the text or "no speech in the record". */
export type VoiceTranscript = { kind: 'text'; text: string } | { kind: 'no-speech' }

/** Codes of the voice errors: of the server (`POST /transcriptions/voice`) and of the client. */
export type VoiceErrorCode =
  | 'VOICE_AUDIO_REQUIRED'
  | 'VOICE_TOO_LARGE'
  | 'VOICE_TOO_LONG'
  | 'VOICE_UNSUPPORTED_FORMAT'
  | 'VOICE_RATE_LIMITED'
  | 'VOICE_PROVIDER_UNAVAILABLE'
  | 'microphone-denied'
  | 'no-speech'

export class VoiceError extends Error {
  readonly code: VoiceErrorCode
  /** `Retry-After` of the server for VOICE_RATE_LIMITED. */
  readonly retryAfterSec?: number

  constructor(code: VoiceErrorCode, options?: { message?: string; retryAfterSec?: number }) {
    super(options?.message ?? code)
    this.name = 'VoiceError'
    this.code = code
    this.retryAfterSec = options?.retryAfterSec
  }
}

export type MicrophoneAccess = 'granted' | 'denied' | 'prompt-elsewhere'

/** Port of the app: sends a record to the server; the app brings the transport and the microphone permission. */
export type VoiceTranscriptionPort = {
  /** Rejects with `VoiceError` for the codes of the server; any other failure counts as "service unavailable". */
  transcribe: (audio: Blob, options: { signal: AbortSignal }) => Promise<VoiceTranscript>
  /**
   * Asks for the permission before the recording where the platform needs it (the side panel of a browser extension
   * asks on a separate page). `prompt-elsewhere`: the question is shown elsewhere, the user presses the microphone again.
   */
  ensureMicrophoneAccess?: () => Promise<MicrophoneAccess>
}
