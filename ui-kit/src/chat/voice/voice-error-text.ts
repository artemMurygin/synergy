import type { VoiceErrorCode } from './types'

export type VoiceErrorView = {
  icon: 'mic-off' | 'audio-lines' | 'timer' | 'cloud-off' | 'clock'
  title: string
  body: string
  /** Label of the retry button. */
  action: string
}

const UNAVAILABLE: VoiceErrorView = {
  icon: 'cloud-off',
  title: 'Сервис распознавания недоступен',
  body: 'Не удалось расшифровать запись. Повторите позже или наберите текст.',
  action: 'Повторить',
}

const TOO_LONG: VoiceErrorView = {
  icon: 'timer',
  title: 'Запись слишком длинная',
  body: 'Максимум — 3 минуты и 5 МБ. Запишите вопрос короче.',
  action: 'Повторить',
}

/** Texts of the voice errors of the form (design: section "Голос — ошибки в композере"). */
export const VOICE_ERROR_VIEWS: Record<VoiceErrorCode, VoiceErrorView> = {
  'microphone-denied': {
    icon: 'mic-off',
    title: 'Нет доступа к микрофону',
    body: 'Разрешите доступ к микрофону в настройках браузера или системы и нажмите микрофон снова.',
    action: 'Повторить',
  },
  'no-speech': {
    icon: 'audio-lines',
    title: 'Речь не распознана',
    body: 'В записи не нашлось речи. Текст в поле не изменён — говорите ближе к микрофону.',
    action: 'Записать снова',
  },
  VOICE_TOO_LONG: TOO_LONG,
  VOICE_TOO_LARGE: TOO_LONG,
  VOICE_RATE_LIMITED: {
    icon: 'clock',
    title: 'Слишком много запросов',
    body: 'Подождите немного и запишите снова.',
    action: 'Повторить',
  },
  VOICE_PROVIDER_UNAVAILABLE: UNAVAILABLE,
  VOICE_UNSUPPORTED_FORMAT: UNAVAILABLE,
  VOICE_AUDIO_REQUIRED: UNAVAILABLE,
}
