import { createContext, useContext } from 'react'
import type { MessageFile } from './attachments/file-upload-port'

export type ThreadActions = {
  /** The server still runs the agent of this chat (not a local run of the runtime). */
  serverRunning: boolean
  onRetry: () => void
  onCancel: () => void
  onDownload?: (file: MessageFile) => void
  /** Ids of the files being downloaded. */
  pendingDownloads?: ReadonlySet<string>
  /** Whether a message of the feed can be edited (the app knows its server id and `editable`). */
  isEditable?: (messageId: string) => boolean
  /** The user sends an edited question: the app sets the restart point before the run. */
  onEdit?: (messageId: string) => void
  /** The feed learns which question is being edited (its answer is marked as to be replaced). */
  setEditingMessageId?: (messageId: string | null) => void
  editingMessageId?: string | null
  /** The server is unreachable: the form of sending is blocked, the draft stays. */
  offline?: boolean
}

const NOOP: ThreadActions = { serverRunning: false, onRetry: () => undefined, onCancel: () => undefined }

export const ThreadActionsContext = createContext<ThreadActions>(NOOP)

export function useThreadActions(): ThreadActions {
  return useContext(ThreadActionsContext)
}
