import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FileUploadError,
  type FileKind,
  type FileUploadPort,
  type MessageFile,
} from './file-upload-port'

/** The backend accepts at most 5 files per message. */
export const MAX_COMPOSER_FILES = 5
export const LIMIT_NOTICE = 'К сообщению можно приложить не больше 5 файлов'
export const GONE_NOTICE = 'Срок хранения файла истёк. Загрузите его заново'
export const GONE_TEXT = 'Срок хранения файла истёк'
export const OFFLINE_TEXT = 'Нет связи с сервером. Повторите загрузку'
const FAILED_TEXT = 'Не удалось загрузить файл'
const NOTICE_MS = 4000

/** Extensions of the types the file storage accepts; the server check stays the source of truth. */
export const ACCEPTED_FILE_TYPES = [
  '.xlsx', '.xls', '.csv', '.docx', '.doc', '.pdf', '.txt',
  '.mp3', '.m4a', '.mp4', '.ogg', '.opus', '.wav', '.webm', '.flac',
].join(',')

export type DraftStatus = 'uploading' | 'ready' | 'error'

/** A file attached to the message draft. */
export type DraftAttachment = {
  /** Local key of the tile; not the stored file id. */
  key: string
  name: string
  sizeBytes: number
  mediaType: string
  kind: FileKind
  status: DraftStatus
  /** Upload fraction 0..1. */
  progress: number
  /** Reason shown on a failed tile. */
  error: string | null
  /** The upload can be repeated: the picked file is still at hand. */
  canRetry: boolean
  /** The stored file id once uploaded. */
  fileId: string | null
  /** Object URL of an image for the thumbnail. */
  previewUrl: string | null
}

export type ComposerAttachmentsState = {
  items: readonly DraftAttachment[]
  add: (files: readonly File[]) => void
  remove: (key: string) => void
  cancel: (key: string) => void
  retry: (key: string) => void
  /** Ids of the uploaded files, in the order they were attached. */
  fileIds: readonly string[]
  isUploading: boolean
  /** Notice above the field (limit, expired file); null when none. */
  notice: string | null
  dismissNotice: () => void
  /** Takes the uploaded files into the message being sent and clears the draft of them. */
  take: () => MessageFile[]
  /** The run was refused because `fileId` expired: the sent files come back, that one failed. */
  restoreExpired: (fileId: string | null) => void
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError'

const UNREACHABLE = /failed to fetch|networkerror|load failed|network request failed|Не удалось связаться/i

function describeFailure(error: unknown): string {
  if (error instanceof FileUploadError) return error.message
  if (error instanceof Error && UNREACHABLE.test(error.message)) return OFFLINE_TEXT
  return FAILED_TEXT
}

function kindOf(file: File): FileKind {
  return file.type.startsWith('audio/') || file.type.startsWith('video/') ? 'recording' : 'document'
}

function previewOf(file: File): string | null {
  if (!file.type.startsWith('image/') || typeof URL.createObjectURL !== 'function') return null
  return URL.createObjectURL(file)
}

function revoke(url: string | null) {
  if (url !== null && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

/** Draft attachments of the chat composer: upload right after attaching, progress, cancel, retry. */
export function useComposerAttachments(port: FileUploadPort): ComposerAttachmentsState {
  const [items, setItems] = useState<DraftAttachment[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const counter = useRef(0)
  const files = useRef(new Map<string, File>())
  const controllers = useRef(new Map<string, AbortController>())
  const lastSent = useRef<MessageFile[]>([])
  const itemsRef = useRef(items)
  const portRef = useRef(port)
  useEffect(() => {
    itemsRef.current = items
    portRef.current = port
  })

  // Leaving the chat cancels uploads still in flight
  useEffect(() => {
    const live = controllers.current
    return () => {
      for (const controller of live.values()) controller.abort()
    }
  }, [])

  useEffect(() => {
    // The limit notice hides by itself; the expired-file notice stays until dismissed or sent
    if (notice !== LIMIT_NOTICE) return
    const timer = setTimeout(() => {
      setNotice(null)
    }, NOTICE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [notice])

  const patch = useCallback((key: string, change: Partial<DraftAttachment>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)))
  }, [])

  const start = useCallback(
    (key: string, file: File) => {
      const controller = new AbortController()
      controllers.current.set(key, controller)
      portRef.current
        .upload(file, {
          signal: controller.signal,
          onProgress: (fraction) => {
            patch(key, { progress: fraction })
          },
        })
        .then(({ fileId }) => {
          patch(key, { status: 'ready', progress: 1, fileId })
        })
        .catch((error: unknown) => {
          if (isAbort(error)) {
            files.current.delete(key)
            setItems((list) => list.filter((item) => item.key !== key))
            return
          }
          patch(key, { status: 'error', error: describeFailure(error) })
        })
        .finally(() => {
          if (controllers.current.get(key) === controller) controllers.current.delete(key)
        })
    },
    [patch],
  )

  const add = useCallback(
    (picked: readonly File[]) => {
      const free = MAX_COMPOSER_FILES - itemsRef.current.length
      const accepted = picked.slice(0, Math.max(0, free))
      if (accepted.length < picked.length) setNotice(LIMIT_NOTICE)
      if (accepted.length === 0) return
      const added = accepted.map((file): DraftAttachment => {
        const key = `draft-${String(++counter.current)}`
        files.current.set(key, file)
        return {
          key,
          name: file.name,
          sizeBytes: file.size,
          mediaType: file.type,
          kind: kindOf(file),
          status: 'uploading',
          progress: 0,
          error: null,
          canRetry: true,
          fileId: null,
          previewUrl: previewOf(file),
        }
      })
      itemsRef.current = [...itemsRef.current, ...added]
      setItems(itemsRef.current)
      for (const item of added) {
        const file = files.current.get(item.key)
        if (file) start(item.key, file)
      }
    },
    [start],
  )

  const cancel = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
  }, [])

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
    controllers.current.delete(key)
    files.current.delete(key)
    revoke(itemsRef.current.find((item) => item.key === key)?.previewUrl ?? null)
    setItems((list) => list.filter((item) => item.key !== key))
  }, [])

  const retry = useCallback(
    (key: string) => {
      const file = files.current.get(key)
      if (!file) return
      patch(key, { status: 'uploading', progress: 0, error: null })
      start(key, file)
    },
    [patch, start],
  )

  const take = useCallback((): MessageFile[] => {
    const ready = itemsRef.current.filter((item) => item.status === 'ready' && item.fileId !== null)
    const sent = ready.map(
      (item): MessageFile => ({
        id: item.fileId ?? '',
        name: item.name,
        mediaType: item.mediaType,
        kind: item.kind,
        sizeBytes: item.sizeBytes,
        status: 'active',
      }),
    )
    const keys = new Set(ready.map((item) => item.key))
    for (const item of ready) {
      files.current.delete(item.key)
      revoke(item.previewUrl)
    }
    lastSent.current = sent
    itemsRef.current = itemsRef.current.filter((item) => !keys.has(item.key))
    setItems(itemsRef.current)
    return sent
  }, [])

  const restoreExpired = useCallback((fileId: string | null) => {
    const back = lastSent.current.map(
      (sent): DraftAttachment => ({
        key: `draft-${String(++counter.current)}`,
        name: sent.name,
        sizeBytes: sent.sizeBytes,
        mediaType: sent.mediaType,
        kind: sent.kind,
        status: sent.id === fileId ? 'error' : 'ready',
        progress: 1,
        error: sent.id === fileId ? GONE_TEXT : null,
        canRetry: false,
        fileId: sent.id,
        previewUrl: null,
      }),
    )
    lastSent.current = []
    itemsRef.current = [...back, ...itemsRef.current]
    setItems(itemsRef.current)
    setNotice(GONE_NOTICE)
  }, [])

  const dismissNotice = useCallback(() => {
    setNotice(null)
  }, [])

  const fileIds = useMemo(
    () => items.flatMap((item) => (item.status === 'ready' && item.fileId !== null ? [item.fileId] : [])),
    [items],
  )
  const isUploading = items.some((item) => item.status === 'uploading')

  return { items, add, remove, cancel, retry, fileIds, isUploading, notice, dismissNotice, take, restoreExpired }
}
