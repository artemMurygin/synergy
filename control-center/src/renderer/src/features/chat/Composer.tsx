import { ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { AlertCircle, Paperclip, X } from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ComposerAttachments } from './ComposerAttachments'
import { ACCEPTED_FILE_TYPES, type ComposerAttachmentsState } from './use-composer-attachments'

interface ComposerProps {
  /** The agent is answering: the send button turns into "Остановить". */
  running: boolean
  /** The field is blocked (loading history, or the server still runs the agent). */
  disabled: boolean
  onStop: () => void
  /** Files attached to the draft (`useComposerAttachments`), shared with the drop zone of the panel. */
  attachments: ComposerAttachmentsState
}

/** Question field with attached files and the send / stop button. */
export function Composer({ running, disabled, onStop, attachments }: ComposerProps) {
  const aui = useAui()
  const text = useAuiState((s) => s.composer.text)
  const picker = useRef<HTMLInputElement>(null)
  const blank = text.trim() === ''
  const hasFiles = attachments.readyFileIds.length > 0
  const canSend = !disabled && !running && !attachments.isUploading && (!blank || hasFiles)

  const submit = () => {
    if (!canSend) return
    attachments.dismissNotice()
    if (!hasFiles) {
      void aui.composer().send()
      return
    }
    const files = attachments.take()
    aui.thread().append({
      role: 'user',
      content: blank ? [] : [{ type: 'text', text }],
      runConfig: { custom: { fileIds: files.map((file) => file.id) } },
      metadata: { custom: { attachments: files } }
    })
    aui.composer().setText('')
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    attachments.add(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  return (
    <ComposerPrimitive.Root
      className="flex flex-col gap-2 border-t p-3"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {attachments.notice !== null && (
        <div role="alert" className="flex items-center gap-2.5 rounded-md bg-brand-red-soft px-3.5 py-2.5">
          <AlertCircle aria-hidden className="size-4 shrink-0 text-brand-red" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-brand-red">{attachments.notice}</p>
          <button
            type="button"
            aria-label="Закрыть сообщение"
            onClick={attachments.dismissNotice}
            className="flex size-6 items-center justify-center rounded-full outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      )}
      <ComposerAttachments
        items={attachments.items}
        onRemove={attachments.remove}
        onCancel={attachments.cancel}
        onRetry={attachments.retry}
      />
      <div className="flex items-end gap-2">
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
        <Button
          type="button"
          variant="outline"
          aria-label="Прикрепить файл"
          className="size-13 shrink-0 rounded-xl p-0"
          disabled={disabled}
          onClick={() => picker.current?.click()}
        >
          <Paperclip aria-hidden className="size-5" />
        </Button>
        <ComposerPrimitive.Input
          rows={2}
          disabled={disabled}
          placeholder="Вопрос агенту"
          onKeyDown={(event) => {
            // Sending goes through submit: it carries the files and blocks while they upload
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          className="max-h-32 min-h-13 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        {running ? (
          <Button type="button" className="h-13 rounded-xl px-4 font-semibold" onClick={onStop}>
            Остановить
          </Button>
        ) : (
          <div className="flex flex-col items-end gap-1">
            {attachments.isUploading && <span className="text-xs text-ink-60">Дождитесь загрузки файлов</span>}
            <Button type="submit" className="h-13 rounded-xl px-4 font-semibold" disabled={!canSend}>
              Отправить
            </Button>
          </div>
        )}
      </div>
    </ComposerPrimitive.Root>
  )
}
