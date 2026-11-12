import { useMutation } from '@tanstack/react-query'
import { saveBlob } from '@/lib/save-blob'
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

export interface DownloadFileVars {
  id: string
  /** The original file name the file is saved under. */
  name: string
}

/** Downloads a file through a fresh signed link and saves it under its original name. */
export function useDownloadFile() {
  return useMutation({
    mutationFn: async ({ id, name }: DownloadFileVars) => {
      const blob = await filesApi.downloadFile(id)
      saveBlob(blob, name)
    }
  })
}
