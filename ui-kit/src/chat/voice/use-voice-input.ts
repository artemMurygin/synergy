import { useCallback, useEffect, useRef, useState } from 'react'
import { VoiceError, type VoiceTranscriptionPort } from './types'
import { levelOf } from './voice-level'

export const MAX_RECORDING_SEC = 180
const MIME_TYPE = 'audio/webm;codecs=opus'
const LEVEL_INTERVAL_MS = 100

export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'error'

export type VoiceInput = {
  state: VoiceState
  elapsedSec: number
  /** Level of the signal 0..1 while recording. */
  level: number
  error: VoiceError | null
  start: () => Promise<void>
  /** Ends the record and sends it to the transcription. */
  stop: () => void
  /** Drops the record or the request. */
  cancel: () => void
}

type Session = {
  recorder: MediaRecorder
  stream: MediaStream
  context: AudioContext | null
  chunks: Blob[]
  timer: ReturnType<typeof setInterval>
  meter: ReturnType<typeof setInterval> | null
  controller: AbortController
  dropped: boolean
}

function release(session: Session) {
  clearInterval(session.timer)
  if (session.meter !== null) clearInterval(session.meter)
  for (const track of session.stream.getTracks()) track.stop()
  void session.context?.close()
}

function toVoiceError(error: unknown): VoiceError {
  return error instanceof VoiceError ? error : new VoiceError('VOICE_PROVIDER_UNAVAILABLE')
}

/**
 * Voice input: `idle -> recording -> transcribing -> idle | error`. Records with MediaRecorder, stops by itself
 * after 3 minutes, gives the transcript to `onTranscript`; it never sends the message.
 */
export function useVoiceInput(
  port: VoiceTranscriptionPort | undefined,
  onTranscript?: (text: string) => void,
): VoiceInput {
  const [state, setState] = useState<VoiceState>('idle')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<VoiceError | null>(null)
  const session = useRef<Session | null>(null)
  const latest = useRef({ port, onTranscript })
  useEffect(() => {
    latest.current = { port, onTranscript }
  })

  const finish = useCallback((current: Session) => {
    release(current)
    if (session.current === current) session.current = null
    setLevel(0)
  }, [])

  const transcribe = useCallback(
    async (current: Session) => {
      const blob = new Blob(current.chunks, { type: current.recorder.mimeType || 'audio/webm' })
      try {
        const result = await latest.current.port?.transcribe(blob, { signal: current.controller.signal })
        if (current.dropped) return
        if (result?.kind === 'text') {
          latest.current.onTranscript?.(result.text.trim())
          setState('idle')
        } else {
          setError(new VoiceError('no-speech'))
          setState('error')
        }
      } catch (failure) {
        if (current.dropped) return
        setError(toVoiceError(failure))
        setState('error')
      } finally {
        if (session.current === current) session.current = null
      }
    },
    [],
  )

  const stop = useCallback(() => {
    const current = session.current
    if (current?.recorder.state !== 'recording') return
    setState('transcribing')
    current.recorder.stop()
  }, [])

  const cancel = useCallback(() => {
    const current = session.current
    if (current !== null) {
      current.dropped = true
      current.controller.abort()
      if (current.recorder.state === 'recording') current.recorder.stop()
      finish(current)
    }
    setError(null)
    setState('idle')
  }, [finish])

  const start = useCallback(async () => {
    if (session.current !== null || latest.current.port === undefined) return
    setError(null)
    const denied = () => {
      setError(new VoiceError('microphone-denied'))
      setState('error')
    }
    const access = await latest.current.port.ensureMicrophoneAccess?.()
    if (access === 'denied') {
      denied()
      return
    }
    if (access === 'prompt-elsewhere') {
      setState('idle')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      denied()
      return
    }
    const supported = typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(MIME_TYPE)
    const recorder = new MediaRecorder(stream, supported ? { mimeType: MIME_TYPE } : undefined)
    let context: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    if (typeof AudioContext !== 'undefined') {
      // The wave is a nicety: a failure of the analyser must not break the recording
      try {
        context = new AudioContext()
        analyser = context.createAnalyser()
        analyser.fftSize = 256
        context.createMediaStreamSource(stream).connect(analyser)
      } catch {
        void context?.close()
        context = null
        analyser = null
      }
    }
    const chunks: Blob[] = []
    const current: Session = {
      recorder,
      stream,
      context,
      chunks,
      timer: setInterval(() => {
        setElapsedSec((value) => value + 1)
      }, 1000),
      meter: null,
      controller: new AbortController(),
      dropped: false,
    }
    if (analyser !== null) {
      const samples = new Uint8Array(analyser.fftSize)
      const node = analyser
      current.meter = setInterval(() => {
        node.getByteTimeDomainData(samples)
        setLevel(levelOf(samples))
      }, LEVEL_INTERVAL_MS)
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      release(current)
      setLevel(0)
      if (!current.dropped) void transcribe(current)
    }
    session.current = current
    setElapsedSec(0)
    setState('recording')
    recorder.start()
  }, [transcribe])

  useEffect(() => {
    if (state === 'recording' && elapsedSec >= MAX_RECORDING_SEC) stop()
  }, [state, elapsedSec, stop])

  useEffect(
    () => () => {
      const current = session.current
      if (current === null) return
      current.dropped = true
      current.controller.abort()
      if (current.recorder.state === 'recording') current.recorder.stop()
      release(current)
      session.current = null
    },
    [],
  )

  return { state, elapsedSec, level, error, start, stop, cancel }
}
