import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackendError, FileTooLargeError, UnsupportedFileTypeError } from '@/lib/backend/errors'
import type { FileKind, StoredFile } from '@/lib/backend/files.schema'
import { useUploadFile } from '@/lib/backend/files.queries'
import { isUnreachable } from './run-errors'

/** The backend accepts at most 5 files per message. */
export const MAX_COMPOSER_FILES = 5
export const LIMIT_NOTICE = 'К сообщению можно приложить не больше 5 файлов'
export const GONE_NOTICE = 'Срок хранения файла истёк. Загрузите его заново'
export const GONE_TEXT = 'Срок хранения файла истёк'
export const OFFLINE_TEXT = 'Нет связи с сервером. Повторите загрузку'
const FAILED_TEXT = 'Не удалось загрузить файл'
const NOTICE_MS = 4000

/** Extensions of the types `file-storage` accepts; the server check stays the source of truth. */
export const ACCEPTED_FILE_TYPES = [
  '.xlsx', '.xls', '.csv', '.docx', '.doc', '.pdf', '.txt',
  '.mp3', '.m4a', '.mp4', '.ogg', '.opus', '.wav', '.webm', '.flac'
].join(',')

export type DraftStatus = 'uploading' | 'ready' | 'error'

/** A file attached to the message draft. */
export interface DraftAttachment {
  /** Local key of the card; not the stored file id. */
  key: string
  name: string
  sizeBytes: number
  kind: FileKind
  status: DraftStatus
  /** Upload fraction 0..1. */
  progress: number
  /** Reason shown on a failed card. */
  error: string | null
  /** The upload can be repeated: the picked file is still at hand. */
  canRetry: boolean
  /** The stored file once uploaded. */
  stored: StoredFile | null
}

export interface ComposerAttachmentsState {
  items: readonly DraftAttachment[]
  add: (files: readonly File[]) => void
  remove: (key: string) => void
  cancel: (key: string) => void
  retry: (key: string) => void
  /** Ids of the uploaded files, in the order they were attached. */
  readyFileIds: readonly string[]
  isUploading: boolean
  /** Notice above the field (limit, expired file); null when none. */
  notice: string | null
  dismissNotice: () => void
  /** Takes the uploaded files into the message being sent and clears the draft of them. */
  take: () => StoredFile[]
  /** The run was refused because `fileId` expired: the sent files come back, that one failed. */
  restoreExpired: (fileId: string | null) => void
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError'

function describeFailure(error: unknown): string {
  if (error instanceof UnsupportedFileTypeError || error instanceof FileTooLargeError) return error.message
  if (error instanceof BackendError && isUnreachable(error.message)) return OFFLINE_TEXT
  if (error instanceof TypeError && isUnreachable(error.message)) return OFFLINE_TEXT
  return FAILED_TEXT
}

function kindOf(file: File): FileKind {
  return file.type.startsWith('audio/') || file.type.startsWith('video/') ? 'recording' : 'document'
}

/** Draft attachments of the chat composer: upload right after attaching, progress, cancel, retry. */
export function useComposerAttachments(): ComposerAttachmentsState {
  const upload = useUploadFile()
  const { mutateAsync } = upload
  const [items, setItems] = useState<DraftAttachment[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const counter = useRef(0)
  const files = useRef(new Map<string, File>())
  const controllers = useRef(new Map<string, AbortController>())
  const lastSent = useRef<StoredFile[]>([])
  const itemsRef = useRef(items)
  itemsRef.current = items

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
      mutateAsync({
        file,
        options: {
          signal: controller.signal,
          onProgress: (fraction) => {
            patch(key, { progress: fraction })
          }
        }
      })
        .then((stored) => {
          patch(key, { status: 'ready', progress: 1, stored, kind: stored.kind, sizeBytes: stored.sizeBytes })
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
    [mutateAsync, patch]
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
          kind: kindOf(file),
          status: 'uploading',
          progress: 0,
          error: null,
          canRetry: true,
          stored: null
        }
      })
      itemsRef.current = [...itemsRef.current, ...added]
      setItems(itemsRef.current)
      for (const item of added) {
        const file = files.current.get(item.key)
        if (file) start(item.key, file)
      }
    },
    [start]
  )

  const cancel = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
  }, [])

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
    controllers.current.delete(key)
    files.current.delete(key)
    setItems((list) => list.filter((item) => item.key !== key))
  }, [])

  const retry = useCallback(
    (key: string) => {
      const file = files.current.get(key)
      if (!file) return
      patch(key, { status: 'uploading', progress: 0, error: null })
      start(key, file)
    },
    [patch, start]
  )

  const take = useCallback((): StoredFile[] => {
    const sent = itemsRef.current.flatMap((item) => (item.status === 'ready' && item.stored ? [item.stored] : []))
    const keys = new Set(itemsRef.current.filter((item) => item.status === 'ready').map((item) => item.key))
    for (const key of keys) files.current.delete(key)
    lastSent.current = sent
    itemsRef.current = itemsRef.current.filter((item) => !keys.has(item.key))
    setItems(itemsRef.current)
    return sent
  }, [])

  const restoreExpired = useCallback((fileId: string | null) => {
    const back = lastSent.current.map(
      (stored): DraftAttachment => ({
        key: `draft-${String(++counter.current)}`,
        name: stored.name,
        sizeBytes: stored.sizeBytes,
        kind: stored.kind,
        status: stored.id === fileId ? 'error' : 'ready',
        progress: 1,
        error: stored.id === fileId ? GONE_TEXT : null,
        canRetry: false,
        stored
      })
    )
    lastSent.current = []
    itemsRef.current = [...back, ...itemsRef.current]
    setItems(itemsRef.current)
    setNotice(GONE_NOTICE)
  }, [])

  const dismissNotice = useCallback(() => {
    setNotice(null)
  }, [])

  const readyFileIds = useMemo(
    () => items.flatMap((item) => (item.status === 'ready' && item.stored ? [item.stored.id] : [])),
    [items]
  )
  const isUploading = items.some((item) => item.status === 'uploading')

  return { items, add, remove, cancel, retry, readyFileIds, isUploading, notice, dismissNotice, take, restoreExpired }
}
