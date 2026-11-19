import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from '@synergy/ui-kit'
import type { AttachmentListProps, FileUploadPort } from '@synergy/ui-kit'
import { useMemo } from 'react'
import { saveBlob } from '@/shared/save-blob'
import {
  AttachmentLimitError,
  AttachmentTooLargeError,
  deleteAttachment,
  downloadAttachment,
  uploadAttachment,
} from '@/shared/tasks-api'

export const TOO_LARGE_TEXT = 'Файл слишком большой: максимум 20 МБ'
export const LIMIT_TEXT = 'Достигнут лимит: не больше 10 файлов на задачу'

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

function failure(error: unknown, fallback: string): Error {
  if (error instanceof AttachmentTooLargeError) return new Error(TOO_LARGE_TEXT, { cause: error })
  if (error instanceof AttachmentLimitError) return new Error(LIMIT_TEXT, { cause: error })
  return new Error(error instanceof Error && error.message !== '' ? error.message : fallback, {
    cause: error,
  })
}

/** Upload of a task attachment: multipart POST on `/tasks/:id/attachments`, XHR with the bearer token. */
export function taskAttachmentPort(taskId: string): FileUploadPort {
  return {
    async upload(file, options) {
      const stored = await uploadAttachment(taskId, file, options)
      return { fileId: stored.id }
    },
  }
}

interface Options {
  taskId: string
  /** Attachments shown now: the count is checked before a request. */
  attachments: readonly { id: string }[]
  /** Replaceable in tests; by default the attachments endpoint of the task. */
  port?: FileUploadPort
  /** The list of the task is stale: re-read it. */
  onChanged: () => void
}

type Handlers = Pick<
  AttachmentListProps,
  'onUpload' | 'onDelete' | 'onDownload' | 'maxBytes' | 'maxFiles'
>

/** Handlers for the attachments list of the package: limits, readable errors, refresh after changes. */
export function useTaskAttachments({ taskId, attachments, port, onChanged }: Options): Handlers {
  const uploadPort = useMemo(() => port ?? taskAttachmentPort(taskId), [port, taskId])
  const count = attachments.length

  return {
    maxBytes: MAX_ATTACHMENT_BYTES,
    maxFiles: MAX_ATTACHMENTS,
    async onUpload(file, options) {
      if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(TOO_LARGE_TEXT)
      if (count >= MAX_ATTACHMENTS) throw new Error(LIMIT_TEXT)
      try {
        await uploadPort.upload(file, options)
      } catch (error) {
        if (isAbort(error)) throw error
        throw failure(error, 'Не удалось загрузить файл')
      }
      onChanged()
    },
    async onDelete(attachment) {
      try {
        await deleteAttachment(taskId, attachment.id)
      } catch (error) {
        throw failure(error, 'Не удалось удалить файл')
      }
      onChanged()
    },
    async onDownload(attachment) {
      try {
        const file = await downloadAttachment(taskId, attachment.id)
        saveBlob(file.blob, file.fileName)
      } catch (error) {
        throw failure(error, 'Не удалось скачать файл')
      }
    },
  }
}
