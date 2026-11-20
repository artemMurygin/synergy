import { ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { useRef, type ChangeEvent, type ReactNode } from 'react'
import {
  ArrowUp,
  AudioLines,
  CircleAlert,
  Clock,
  CloudOff,
  LoaderCircle,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Square,
  Timer,
  X,
} from '../icons'
import { cn } from '../lib/cn'
import { ComposerAttachments, useFileDrop } from './attachments/ComposerAttachments'
import { ACCEPTED_FILE_TYPES, type useComposerAttachments } from './attachments/use-composer-attachments'
import { useThreadActions } from './thread-context'
import type { VoiceTranscriptionPort } from './voice/types'
import { useVoiceInput } from './voice/use-voice-input'
import { VOICE_ERROR_VIEWS, type VoiceErrorView } from './voice/voice-error-text'
import { VoiceRecorderBar } from './VoiceRecorderBar'

export type ComposerProps = {
  /** Files attached to the draft (`useComposerAttachments`). */
  attachments: ReturnType<typeof useComposerAttachments>
  /** The field is blocked (e.g. the history is loading). */
  disabled?: boolean
  placeholder?: string
  /** Port of the voice input; without it there is no microphone button. */
  voice?: VoiceTranscriptionPort
  /** Slot of extra tools of the app next to the plus (e.g. the quick search of the extension). */
  tools?: ReactNode
}

const VOICE_ICONS: Record<VoiceErrorView['icon'], typeof MicOff> = {
  'mic-off': MicOff,
  'audio-lines': AudioLines,
  timer: Timer,
  'cloud-off': CloudOff,
  clock: Clock,
}

const OFFLINE_PLACEHOLDER = 'Нет связи с сервером'

const ROUND = 'flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40'

/** Form of sending (Composer Box): field, attach button, drop of files, round send / stop button. */
export function Composer({ attachments, disabled = false, placeholder = 'Сообщение агенту', voice, tools }: ComposerProps) {
  const aui = useAui()
  const { serverRunning, onCancel, offline = false } = useThreadActions()
  const localRunning = useAuiState((s) => s.thread.isRunning)
  const text = useAuiState((s) => s.composer.text)
  const picker = useRef<HTMLInputElement>(null)
  const running = localRunning || serverRunning
  const blocked = disabled || serverRunning || offline
  const blank = text.trim() === ''
  const hasFiles = attachments.fileIds.length > 0
  const { dragging, handlers } = useFileDrop(attachments.add, blocked)
  const dictation = useVoiceInput(voice, (spoken) => {
    if (spoken === '') return
    const typed = aui.composer.getState().text
    aui.composer.setText(typed.trim() === '' ? spoken : `${typed.replace(/\s+$/, '')} ${spoken}`)
  })
  const recording = dictation.state === 'recording'
  const transcribing = dictation.state === 'transcribing'
  const voiceBusy = recording || transcribing
  const voiceError = dictation.state === 'error' && dictation.error !== null ? VOICE_ERROR_VIEWS[dictation.error.code] : null
  const canSend = !blocked && !running && !voiceBusy && !attachments.isUploading && (!blank || hasFiles)

  const submit = () => {
    if (!canSend) return
    attachments.dismissNotice()
    if (!hasFiles) {
      aui.composer.send()
      return
    }
    const files = attachments.take()
    aui.thread.append({
      role: 'user',
      content: blank ? [] : [{ type: 'text', text }],
      runConfig: { custom: { fileIds: files.map((file) => file.id) } },
      metadata: { custom: { attachments: files } },
    })
    aui.composer.setText('')
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    attachments.add(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  return (
    <ComposerPrimitive.Root
      {...handlers}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className={cn(
        'flex flex-col gap-1.5 rounded-[20px] border bg-surface px-2.5 pt-2.5 pb-2 shadow-panel transition-colors',
        dragging ? 'border-brand-red' : 'border-border',
      )}
    >
      {attachments.notice !== null && (
        <div role="alert" className="flex items-center gap-2.5 rounded-xl bg-brand-red-soft py-2 pr-2 pl-3">
          <CircleAlert size={16} className="shrink-0 text-brand-red" />
          <p className="min-w-0 flex-1 font-chat text-[13px] font-semibold text-brand-red">{attachments.notice}</p>
          <button
            type="button"
            aria-label="Закрыть сообщение"
            onClick={attachments.dismissNotice}
            className="flex size-6 items-center justify-center rounded-full outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {voiceError !== null && <VoiceNotice view={voiceError} onRetry={() => void dictation.start()} />}
      <ComposerAttachments
        items={attachments.items}
        onRemove={attachments.remove}
        onCancel={attachments.cancel}
        onRetry={attachments.retry}
      />
      {recording && <VoiceRecorderBar elapsedSec={dictation.elapsedSec} level={dictation.level} />}
      {transcribing && (
        <p role="status" className="flex items-center gap-2 p-1.5 font-chat text-[15px] text-ink-60">
          <LoaderCircle size={16} className="animate-spin text-brand-red" />
          Распознаю речь…
        </p>
      )}
      <ComposerPrimitive.Input
        hidden={voiceBusy}
        rows={1}
        autoFocus
        data-chat-composer-input=""
        disabled={blocked || voiceBusy}
        placeholder={offline ? OFFLINE_PLACEHOLDER : placeholder}
        aria-label="Сообщение агенту"
        onKeyDown={(event) => {
          // Sending goes through submit: it carries the files and blocks while they upload
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
        className="max-h-40 min-h-[30px] w-full resize-none bg-transparent p-1.5 font-chat text-[15px] leading-[1.4] text-ink outline-none placeholder:text-ink-40 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex items-center gap-1">
        <input
          ref={picker}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          tabIndex={-1}
          aria-label="Выбрать файлы"
          className="sr-only"
          onChange={onPick}
        />
        <button
          type="button"
          aria-label="Прикрепить файл"
          disabled={blocked || voiceBusy}
          onClick={() => picker.current?.click()}
          className={cn(ROUND, 'text-ink-60 hover:bg-surface-alt disabled:opacity-50')}
        >
          <Plus size={18} />
        </button>
        {tools}
        <span className="flex-1" />
        {voice !== undefined &&
          (recording ? (
            <button
              type="button"
              aria-label="Остановить запись"
              onClick={dictation.stop}
              className={cn(ROUND, 'bg-brand-red-soft text-brand-red hover:bg-border')}
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Микрофон"
              disabled={blocked || running || transcribing}
              onClick={() => void dictation.start()}
              className={cn(ROUND, 'text-ink-60 hover:bg-surface-alt disabled:opacity-50')}
            >
              <Mic size={18} />
            </button>
          ))}
        {attachments.isUploading && !running && (
          <span className="font-chat text-xs text-ink-60">Дождитесь загрузки файлов</span>
        )}
        {running ? (
          <button
            type="button"
            aria-label="Остановить"
            onClick={onCancel}
            className={cn(ROUND, 'bg-ink text-white hover:bg-ink-80')}
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Отправить"
            disabled={!canSend}
            className={cn(ROUND, 'bg-brand-red text-white hover:bg-brand-red-hover disabled:opacity-40')}
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </ComposerPrimitive.Root>
  )
}

/** Error of the voice input above the field (Notice): what happened and how to go on; the draft stays. */
function VoiceNotice({ view, onRetry }: { view: VoiceErrorView; onRetry: () => void }) {
  const Icon = VOICE_ICONS[view.icon]
  return (
    <div role="alert" className="flex items-center gap-2.5 rounded-2xl bg-warning-soft py-2.5 pr-2.5 pl-3.5">
      <Icon size={18} className="shrink-0 text-warning" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 font-chat">
        <p className="text-sm font-medium text-ink">{view.title}</p>
        <p className="text-[13px] text-ink-60">{view.body}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-2xl bg-surface px-3 font-chat text-[13px] text-ink-80 outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40"
      >
        <RotateCcw size={14} />
        {view.action}
      </button>
    </div>
  )
}
