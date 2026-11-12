import { MessagePrimitive, useAuiState } from '@assistant-ui/react'
import { MessageAttachments } from './MessageAttachments'
import { messageFiles } from './message-files'

/** Question of the user: files above an accent bubble on the right; a message of files only has no bubble. */
export function UserMessage() {
  const message = useAuiState((s) => s.message)
  const files = messageFiles(message)
  const hasText = message.content.some((part) => part.type === 'text' && part.text.trim().length > 0)

  return (
    <MessagePrimitive.Root className="flex w-full flex-col items-end gap-1.5">
      <MessageAttachments files={files} align="end" />
      {hasText && (
        <div className="max-w-[85%] rounded-2xl bg-primary px-3.5 py-2.5 text-sm leading-[1.4] break-words whitespace-pre-wrap text-white">
          <MessagePrimitive.Parts />
        </div>
      )}
    </MessagePrimitive.Root>
  )
}
