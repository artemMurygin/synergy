import { ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { useRef, type ChangeEvent } from 'react'
import { ArrowUp, CircleAlert, Paperclip, Square, X } from '../icons'
import { cn } from '../lib/cn'
import { ComposerAttachments, useFileDrop } from './attachments/ComposerAttachments'
import { ACCEPTED_FILE_TYPES, type useComposerAttachments } from './attachments/use-composer-attachments'
import { useThreadActions } from './thread-context'

export type ComposerProps = {
  /** Files attached to the draft (`useComposerAttachments`). */
  attachments: ReturnType<typeof useComposerAttachments>
  /** The field is blocked (e.g. the history is loading). */
  disabled?: boolean
  placeholder?: string
}

const OFFLINE_PLACEHOLDER = 'Нет связи с сервером'

const ROUND = 'flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40'

/** Form of sending (Composer Box): field, attach button, drop of files, round send / stop button. */
export function Composer({ attachments, disabled = false, placeholder = 'Сообщение агенту' }: ComposerProps) {
  const aui = useAui()
  const { serverRunning, onCancel, offline = false } = useThreadActions()
  const localRunning = useAuiState((s) => s.thread.isRunning)
  const text = useAuiState((s) => s.composer.text)
  const picker = useRef<HTMLInputElement>(null)
  const running = localRunning || serverRunning
  const blocked = disabled || serverRunning || offline
  const blank = text.trim() === ''
  const hasFiles = attachments.fileIds.length > 0
  const canSend = !blocked && !running && !attachments.isUploading && (!blank || hasFiles)
  const { dragging, handlers } = useFileDrop(attachments.add, blocked)

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
      <ComposerAttachments
        items={attachments.items}
        onRemove={attachments.remove}
        onCancel={attachments.cancel}
        onRetry={attachments.retry}
      />
      <ComposerPrimitive.Input
        rows={1}
        autoFocus
        data-chat-composer-input=""
        disabled={blocked}
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
          disabled={blocked}
          onClick={() => picker.current?.click()}
          className={cn(ROUND, 'text-ink-60 hover:bg-surface-alt disabled:opacity-50')}
        >
          <Paperclip size={18} />
        </button>
        <span className="flex-1" />
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
