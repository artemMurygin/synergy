import { AlertCircle, Download, FileText, Paperclip, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { BackendError, AttachmentLimitError, AttachmentTooLargeError, TaskNotFoundError } from '@/lib/backend/errors'
import * as tasksApi from '@/lib/backend/tasks.api'
import { taskQuery, useDeleteAttachment, useUploadAttachment } from '@/lib/backend/tasks.queries'
import type { Attachment } from '@/lib/backend/tasks.schema'
import { formatSize } from '@/lib/format-size'
import { saveBlob } from '@/lib/save-blob'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from './ConfirmDialog'

// Backend defaults; the 413 and 422 responses stay the source of truth.
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_ATTACHMENTS = 10

const TOO_LARGE_TEXT = 'Файл слишком большой: максимум 20 МБ'
const LIMIT_TEXT = `Достигнут лимит: не больше ${String(MAX_ATTACHMENTS)} файлов на задачу`

interface Upload {
  key: number
  name: string
  controller: AbortController
}

interface Problem {
  key: number
  text: string
  /** File name and size, shown under the message. */
  detail?: string
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError'

function describeFailure(error: unknown, fallback: string): string {
  if (error instanceof AttachmentTooLargeError) return TOO_LARGE_TEXT
  if (error instanceof AttachmentLimitError) return LIMIT_TEXT
  return error instanceof BackendError ? error.message : fallback
}

const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer.types).includes('Files')

interface AttachmentListProps {
  taskId: string
  attachments: Attachment[]
}

export function AttachmentList({ taskId, attachments }: AttachmentListProps) {
  const queryClient = useQueryClient()
  const upload = useUploadAttachment()
  const remove = useDeleteAttachment()
  const input = useRef<HTMLInputElement>(null)
  const counter = useRef(0)
  const live = useRef(new Set<AbortController>())
  const [uploads, setUploads] = useState<Upload[]>([])
  const [problems, setProblems] = useState<Problem[]>([])
  const [dragging, setDragging] = useState(false)
  const [toDelete, setToDelete] = useState<Attachment | null>(null)

  // leaving the panel cancels uploads still in flight
  useEffect(() => {
    const controllers = live.current
    return () => {
      for (const controller of controllers) controller.abort()
    }
  }, [])

  const addProblem = (text: string, detail?: string) =>
    setProblems((list) => [...list, { key: ++counter.current, text, detail }])

  const startUpload = (file: File) => {
    const controller = new AbortController()
    const key = ++counter.current
    live.current.add(controller)
    setUploads((list) => [...list, { key, name: file.name, controller }])
    upload
      .mutateAsync({ taskId, file, options: { signal: controller.signal } })
      .catch((error: unknown) => {
        if (!isAbort(error)) addProblem(describeFailure(error, 'Не удалось загрузить файл'), `${file.name} · ${formatSize(file.size)}`)
      })
      .finally(() => {
        live.current.delete(controller)
        setUploads((list) => list.filter((item) => item.key !== key))
      })
  }

  const addFiles = (files: File[]) => {
    let count = attachments.length + uploads.length
    for (const file of files) {
      const detail = `${file.name} · ${formatSize(file.size)}`
      if (file.size > MAX_ATTACHMENT_BYTES) addProblem(TOO_LARGE_TEXT, detail)
      else if (count >= MAX_ATTACHMENTS) addProblem(LIMIT_TEXT, detail)
      else {
        count++
        startUpload(file)
      }
    }
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    setDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    setDragging(true)
  }

  const onDragLeave = (event: DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
  }

  const download = async (attachment: Attachment) => {
    try {
      const { blob, fileName } = await tasksApi.downloadAttachment(taskId, attachment.id)
      saveBlob(blob, fileName)
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        // already deleted elsewhere: refreshing the details drops it from the list
        await queryClient.invalidateQueries({ queryKey: taskQuery(taskId).queryKey })
        return
      }
      addProblem(describeFailure(error, 'Не удалось скачать файл'), attachment.originalName)
    }
  }

  const confirmDelete = () => {
    if (!toDelete) return
    remove
      .mutateAsync({ taskId, attachmentId: toDelete.id })
      .then(() => setToDelete(null))
      .catch((error: unknown) => {
        setToDelete(null)
        addProblem(describeFailure(error, 'Не удалось удалить вложение'), toDelete.originalName)
      })
  }

  return (
    <section
      role="region"
      aria-label="Вложения"
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'flex min-h-[96px] flex-col gap-3 rounded-xl border border-transparent p-1',
        dragging && 'border-dashed border-brand-red bg-brand-red-soft'
      )}
    >
      <div className="flex items-center gap-3">
        <h3 className="flex-1 text-xs font-semibold tracking-wide text-ink-60 uppercase">
          Вложения · {attachments.length}
        </h3>
        <input ref={input} type="file" multiple tabIndex={-1} aria-label="Выбрать файлы" className="sr-only" onChange={onPick} />
        <Button type="button" variant="outline" className="h-9 gap-1.5 rounded-full px-4" onClick={() => input.current?.click()}>
          Добавить файл
          <Paperclip aria-hidden className="size-4" />
        </Button>
      </div>

      {dragging && <p className="text-center text-sm font-semibold text-brand-red">Отпустите файлы, чтобы прикрепить</p>}

      {problems.map((problem) => (
        <div key={problem.key} role="alert" className="flex items-start gap-2.5 rounded-xl bg-brand-red-soft px-3.5 py-3">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-red" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand-red">{problem.text}</p>
            {problem.detail && <p className="truncate text-[13px] text-ink-60">{problem.detail}</p>}
          </div>
          <button
            type="button"
            aria-label="Закрыть сообщение"
            onClick={() => setProblems((list) => list.filter((item) => item.key !== problem.key))}
            className="flex size-6 items-center justify-center rounded-full outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      ))}

      <ul className="flex flex-col gap-2">
        {attachments.map((attachment) => (
          <li key={attachment.id} className="flex items-center gap-3 rounded-xl bg-surface-alt px-3.5 py-2.5">
            <FileText aria-hidden className="size-5 shrink-0 text-ink-60" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{attachment.originalName}</p>
              <p className="text-xs text-ink-60">{formatSize(attachment.sizeBytes)}</p>
            </div>
            <button
              type="button"
              aria-label={`Скачать: ${attachment.originalName}`}
              onClick={() => void download(attachment)}
              className="flex size-8 items-center justify-center rounded-full text-ink-60 outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Удалить вложение: ${attachment.originalName}`}
              onClick={() => setToDelete(attachment)}
              className="flex size-8 items-center justify-center rounded-full text-ink-60 outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </li>
        ))}
        {uploads.map((item) => (
          <li key={item.key} className="flex flex-col gap-2 rounded-xl bg-surface-alt px-3.5 py-2.5">
            <div className="flex items-center gap-3">
              <FileText aria-hidden className="size-5 shrink-0 text-ink-60" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</p>
              <span className="text-xs text-ink-60">Загрузка…</span>
              <button
                type="button"
                aria-label={`Отменить загрузку: ${item.name}`}
                onClick={() => item.controller.abort()}
                className="rounded text-[13px] font-semibold text-brand-red outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Отменить
              </button>
            </div>
            {/* upload progress is not reported by the cc-api protocol, so the bar is indeterminate */}
            <div
              role="progressbar"
              aria-label={`Загрузка: ${item.name}`}
              className="h-1 w-full overflow-hidden rounded-full bg-border"
            >
              <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-red" />
            </div>
          </li>
        ))}
      </ul>

      {attachments.length === 0 && uploads.length === 0 && (
        <p className="text-[13px] text-ink-60">Файлов пока нет. Перетащите файлы сюда или нажмите «Добавить файл».</p>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Удалить вложение?"
        description={toDelete ? `Файл «${toDelete.originalName}» будет удалён без возможности восстановления.` : ''}
        confirmLabel="Удалить"
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </section>
  )
}
