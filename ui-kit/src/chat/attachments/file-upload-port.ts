export type FileKind = 'document' | 'recording'
export type FileStatus = 'active' | 'deleted'

/** A file shown in a chat message: sent by the user, returned by the agent or posted by the system. */
export type MessageFile = {
  id: string
  name: string
  mediaType: string
  kind: FileKind
  sizeBytes: number
  status: FileStatus
}

export type UploadOptions = {
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** Upload of a picked file; the application owns the transport (XHR with its own auth). */
export type FileUploadPort = {
  upload(file: File, options: UploadOptions): Promise<{ fileId: string }>
}

/** A rejection whose message is ready to show on the card (the application normalizes errors). */
export class FileUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileUploadError'
  }
}
