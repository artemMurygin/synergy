import { ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { useEffect } from 'react'
import { ArrowUp } from '../icons'
import { useThreadActions } from './thread-context'

/** Field that replaces a sent question: the text, "Отмена" and "Отправить". Escape cancels. */
export function EditComposer() {
  const aui = useAui()
  const messageId = useAuiState((s) => s.message.id)
  const blank = useAuiState((s) => s.composer.text.trim() === '')
  const { onEdit, setEditingMessageId } = useThreadActions()

  useEffect(() => {
    setEditingMessageId?.(messageId)
    return () => {
      setEditingMessageId?.(null)
    }
  }, [messageId, setEditingMessageId])

  const send = () => {
    if (blank) return
    onEdit?.(messageId)
    aui.composer.send()
  }

  return (
    <ComposerPrimitive.Root
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
      className="flex w-full flex-col gap-1.5 rounded-[20px] border border-brand-red bg-surface px-2.5 pt-2.5 pb-2"
    >
      <ComposerPrimitive.Input
        rows={1}
        autoFocus
        aria-label="Изменить сообщение"
        onKeyDown={(event) => {
          // Escape cancels inside the primitive (`cancelOnEscape`)
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            send()
          }
        }}
        className="max-h-40 min-h-[30px] w-full resize-none bg-transparent p-1.5 font-chat text-[15px] leading-[1.4] text-ink outline-none"
      />
      <div className="flex items-center justify-end gap-2">
        <ComposerPrimitive.Cancel className="flex h-8 items-center rounded-lg bg-surface-alt px-3.5 font-chat text-[13px] font-semibold text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40">
          Отмена
        </ComposerPrimitive.Cancel>
        <button
          type="submit"
          disabled={blank}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-brand-red px-3.5 font-chat text-[13px] font-semibold text-surface outline-none hover:bg-brand-red-hover focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-40"
        >
          Отправить
          <ArrowUp size={14} />
        </button>
      </div>
    </ComposerPrimitive.Root>
  )
}
