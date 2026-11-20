import { MessagePrimitive, useAuiState } from '@assistant-ui/react'
import { MessageAttachments } from './attachments/MessageAttachments'
import { messageFiles } from './attachments/message-files'
import { HighlightedText } from './HighlightedText'
import { EditComposer } from './EditComposer'
import { useThreadActions } from './thread-context'
import { UserActionBar } from './UserActionBar'

/** Question of the user: files above an accent bubble on the right; a message of files only has no bubble. */
export function UserMessage() {
  const message = useAuiState((s) => s.message)
  const editing = useAuiState((s) => s.composer.isEditing)
  const { onDownload, pendingDownloads, isEditable } = useThreadActions()
  const files = messageFiles(message)
  const hasText = message.content.some((part) => part.type === 'text' && part.text.trim().length > 0)

  if (editing) {
    return (
      <MessagePrimitive.Root className="flex w-full flex-col items-end gap-1.5">
        <EditComposer />
      </MessagePrimitive.Root>
    )
  }

  return (
    <MessagePrimitive.Root className="flex w-full flex-col items-end gap-1.5">
      <MessageAttachments files={files} align="end" pending={pendingDownloads} onDownload={onDownload ?? noop} />
      {hasText && (
        <div className="max-w-[85%] rounded-2xl bg-brand-red px-[18px] py-3 font-chat text-sm leading-[1.4] break-words whitespace-pre-wrap text-white">
          <MessagePrimitive.Parts components={{ Text: HighlightedText }} />
        </div>
      )}
      {hasText && <UserActionBar canEdit={isEditable?.(message.id) ?? false} />}
    </MessagePrimitive.Root>
  )
}

function noop() {
  return undefined
}
