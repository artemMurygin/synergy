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
}

const NOOP: ThreadActions = { serverRunning: false, onRetry: () => undefined, onCancel: () => undefined }

export const ThreadActionsContext = createContext<ThreadActions>(NOOP)

export function useThreadActions(): ThreadActions {
  return useContext(ThreadActionsContext)
}
