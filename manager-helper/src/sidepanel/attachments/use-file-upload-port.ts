import type { FileUploadPort } from '@synergy/ui-kit'
import { useMemo } from 'react'
import { uploadFile } from '@/shared/files-api'

/** Upload of picked files for the composer: XHR with the bearer token on `{backendUrl}/files`. */
export function useFileUploadPort(): FileUploadPort {
  return useMemo<FileUploadPort>(
    () => ({
      async upload(file, options) {
        const stored = await uploadFile(file, options)
        return { fileId: stored.id }
      },
    }),
    [],
  )
}
