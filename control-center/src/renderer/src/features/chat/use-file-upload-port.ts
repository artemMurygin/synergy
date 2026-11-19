import { FileUploadError, type FileUploadPort } from '@synergy/ui-kit'
import { BackendError } from '@/lib/backend/errors'
import { uploadFile } from '@/lib/backend/files.api'
import { isUnreachable } from './run-errors'

// The port is stateless: one object for the whole app, so the hook returns a stable value
const port: FileUploadPort = {
  async upload(file, options) {
    try {
      const stored = await uploadFile(file, options)
      return { fileId: stored.id }
    } catch (error) {
      // A refusal of the backend carries a ready text; an unreachable server and an abort pass as is
      if (error instanceof BackendError && !isUnreachable(error.message)) throw new FileUploadError(error.message)
      throw error
    }
  }
}

/** Upload of composer files over the XHR transport of the backend client (progress, cancellation). */
export function useFileUploadPort(): FileUploadPort {
  return port
}
