import { z } from 'zod'
import { FileKindSchema } from '@/lib/backend/files.schema'
import { MessageAttachmentSchema, type MessageAttachment, type MessageSource } from '@/lib/backend/schema'

/** A file shown in a chat message: sent by the user, returned by the agent or posted by the system. */
export type MessageFile = MessageAttachment

/** AG-UI `CUSTOM` event the backend sends when the agent adds a file to its answer. */
export const FILE_ATTACHED_EVENT = 'file-attached'

/** Value of the `file-attached` event: the stored file is fresh, so it is active. */
const FileAttachedSchema = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: z.string(),
  size: z.number(),
  kind: FileKindSchema
})

interface MessageLike {
  readonly content: readonly { readonly type: string; readonly name?: string; readonly data?: unknown }[]
  readonly metadata?: { readonly custom?: Record<string, unknown> }
}

/** Custom metadata the chat keeps on a runtime message. */
export interface MessageExtras {
  attachments: MessageFile[]
  source: MessageSource
}

function storedAttachments(message: MessageLike): MessageFile[] {
  const raw = message.metadata?.custom?.attachments
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const parsed = MessageAttachmentSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

function streamedAttachments(message: MessageLike): MessageFile[] {
  return message.content.flatMap((part) => {
    if (part.type !== 'data' || part.name !== FILE_ATTACHED_EVENT) return []
    const parsed = FileAttachedSchema.safeParse(part.data)
    if (!parsed.success) return []
    const { size, ...file } = parsed.data
    return [{ ...file, sizeBytes: size, status: 'active' as const }]
  })
}

/** Files of a message: saved with it (history, sent draft) and attached during the stream; one card per file. */
export function messageFiles(message: MessageLike): MessageFile[] {
  const seen = new Set<string>()
  return [...storedAttachments(message), ...streamedAttachments(message)].filter((file) => {
    if (seen.has(file.id)) return false
    seen.add(file.id)
    return true
  })
}

/** `system` for a message the server posted on a domain event, `run` for an answer to a question. */
export function messageSource(message: MessageLike): MessageSource {
  return message.metadata?.custom?.source === 'system' ? 'system' : 'run'
}
