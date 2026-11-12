import { useMutation } from '@tanstack/react-query'
import * as filesApi from './files.api'
import type { UploadOptions } from './files.api'

export interface UploadFileVars {
  file: File
  options?: UploadOptions
}

/** Uploads a file to the user's storage; progress and cancellation go through `options`. */
export function useUploadFile() {
  return useMutation({
    mutationFn: ({ file, options }: UploadFileVars) => filesApi.uploadFile(file, options)
  })
}

/** Requests a fresh signed download link for a file. */
export function useCreateDownloadLink() {
  return useMutation({
    mutationFn: (fileId: string) => filesApi.createDownloadLink(fileId)
  })
}
