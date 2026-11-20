import type { MicrophoneAccess, VoiceTranscriptionPort } from '@synergy/ui-kit'
import { useMemo } from 'react'
import { transcribeVoice } from '@/shared/voice-api'

const PERMISSION_PAGE = 'src/mic-permission/index.html'

async function microphoneState(): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' })
    return status.state
  } catch {
    return 'prompt'
  }
}

/**
 * The side panel of an extension cannot show the permission question itself: with "prompt"
 * the question goes to a separate tab (`mic-permission.html`), the user presses the microphone again.
 */
async function ensureMicrophoneAccess(): Promise<MicrophoneAccess> {
  const state = await microphoneState()
  if (state === 'granted') return 'granted'
  if (state === 'denied') return 'denied'
  await chrome.tabs.create({ url: chrome.runtime.getURL(PERMISSION_PAGE) })
  return 'prompt-elsewhere'
}

/** Port of the voice input for the composer: the transport is the backend, the permission is the extension page. */
export function useVoiceTranscriptionPort(): VoiceTranscriptionPort {
  return useMemo(() => ({ transcribe: transcribeVoice, ensureMicrophoneAccess }), [])
}
