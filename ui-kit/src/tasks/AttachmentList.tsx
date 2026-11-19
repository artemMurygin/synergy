import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { CircleAlert, Download, FileText, Paperclip, Trash2, X } from '../icons'
import { cn } from '../lib/cn'
import { InlineConfirm } from '../primitives/InlineConfirm'
import { formatSize } from './format-size'
import type { TaskAttachment } from './types'

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_ATTACHMENTS = 10

export type UploadOptions = { onProgress: (fraction: number) => void; signal: AbortSignal }

export type AttachmentListProps = {
  attachments: TaskAttachment[]
  /** Грузит файл; ошибки приходят готовым текстом в `Error.message`. */
  onUpload: (file: File, options: UploadOptions) => Promise<void>
  onDelete: (attachment: TaskAttachment) => Promise<void>
  onDownload: (attachment: TaskAttachment) => Promise<void>
  maxBytes?: number
  maxFiles?: number
  isTypeAllowed?: (file: File) => boolean
  /** Можно ли удалить вложение (по умолчанию — любое). */
  canDelete?: (attachment: TaskAttachment) => boolean
}

type Upload = { key: number; name: string; progress: number | null; controller: AbortController }
type Problem = { key: number; text: string; detail?: string }

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError'
const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message !== '' ? error.message : fallback
const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer.types).includes('Files')

const iconButton =
  'flex size-8 items-center justify-center rounded-full text-ink-60 outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand-red/40'

export function AttachmentList(props: AttachmentListProps) {
  const { attachments, maxBytes = MAX_ATTACHMENT_BYTES, maxFiles = MAX_ATTACHMENTS } = props
  const input = useRef<HTMLInputElement>(null)
  const counter = useRef(0)
  const live = useRef(new Set<AbortController>())
  const [uploads, setUploads] = useState<Upload[]>([])
  const [problems, setProblems] = useState<Problem[]>([])
  const [dragging, setDragging] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    const controllers = live.current
    return () => {
      for (const controller of controllers) controller.abort()
    }
  }, [])

  const addProblem = (text: string, detail?: string) => {
    counter.current += 1
    const key = counter.current
    setProblems((list) => [...list, { key, text, detail }])
  }

  const startUpload = (file: File) => {
    const controller = new AbortController()
    counter.current += 1
    const key = counter.current
    live.current.add(controller)
    setUploads((list) => [...list, { key, name: file.name, progress: null, controller }])
    props
      .onUpload(file, {
        signal: controller.signal,
        onProgress: (fraction) => {
          setUploads((list) => list.map((u) => (u.key === key ? { ...u, progress: fraction } : u)))
        },
      })
      .catch((error: unknown) => {
        if (!isAbort(error)) addProblem(messageOf(error, 'Не удалось загрузить файл'), `${file.name} · ${formatSize(file.size)}`)
      })
      .finally(() => {
        live.current.delete(controller)
        setUploads((list) => list.filter((u) => u.key !== key))
      })
  }

  const addFiles = (files: File[]) => {
    let count = attachments.length + uploads.length
    for (const file of files) {
      const detail = `${file.name} · ${formatSize(file.size)}`
      if (props.isTypeAllowed && !props.isTypeAllowed(file)) addProblem('Этот тип файла не поддерживается', detail)
      else if (file.size > maxBytes) addProblem(`Файл слишком большой: максимум ${String(Math.round(maxBytes / 1024 / 1024))} МБ`, detail)
      else if (count >= maxFiles) addProblem(`Достигнут лимит: не больше ${String(maxFiles)} файлов на задачу`, detail)
      else {
        count += 1
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

  const download = (attachment: TaskAttachment) => {
    props.onDownload(attachment).catch((error: unknown) => {
      addProblem(messageOf(error, 'Не удалось скачать файл'), attachment.originalName)
    })
  }

  const confirmDelete = (attachment: TaskAttachment) => {
    setConfirmId(null)
    props.onDelete(attachment).catch((error: unknown) => {
      addProblem(messageOf(error, 'Не удалось удалить вложение'), attachment.originalName)
    })
  }

  return (
    <section
      aria-label="Вложения"
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        const next = event.relatedTarget
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setDragging(false)
      }}
      onDrop={onDrop}
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-transparent',
        dragging && 'border-dashed border-brand-red bg-brand-red-soft',
      )}
    >
      <div className="flex h-7 items-center gap-3">
        <h3 className="flex-1 text-[11px] font-semibold tracking-wide text-ink-40 uppercase">
          {`Вложения · ${String(attachments.length)}`}
        </h3>
        <input ref={input} type="file" multiple tabIndex={-1} aria-label="Выбрать файлы" className="sr-only" onChange={onPick} />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex h-7 items-center gap-1.5 rounded-[14px] bg-surface-alt px-2.5 text-xs font-semibold text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
        >
          <Paperclip size={16} className="text-ink-60" />
          Добавить файл
        </button>
      </div>

      {problems.map((problem) => (
        <div key={problem.key} role="alert" className="flex items-start gap-2.5 rounded-xl bg-brand-red-soft px-3.5 py-3">
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-brand-red" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand-red">{problem.text}</p>
            {problem.detail ? <p className="truncate text-[13px] text-ink-60">{problem.detail}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Закрыть сообщение"
            onClick={() => {
              setProblems((list) => list.filter((p) => p.key !== problem.key))
            }}
            className="flex size-6 items-center justify-center rounded-full outline-none hover:bg-surface"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <ul className="flex flex-col gap-2">
        {attachments.map((attachment) => (
          <li key={attachment.id} className="flex min-h-[48px] flex-wrap items-center gap-3 rounded-[14px] bg-surface-alt py-2 pr-2 pl-3.5">
            <FileText size={20} className="shrink-0 text-ink-60" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{attachment.originalName}</p>
              <p className="text-xs text-ink-60">{formatSize(attachment.sizeBytes)}</p>
            </div>
            <button
              type="button"
              aria-label={`Скачать: ${attachment.originalName}`}
              onClick={() => {
                download(attachment)
              }}
              className={iconButton}
            >
              <Download size={18} />
            </button>
            {props.canDelete?.(attachment) !== false ? (
              <button
                type="button"
                aria-label={`Удалить вложение: ${attachment.originalName}`}
                onClick={() => {
                  setConfirmId(attachment.id)
                }}
                className={iconButton}
              >
                <Trash2 size={18} />
              </button>
            ) : null}
            {confirmId === attachment.id ? (
              <InlineConfirm
                className="w-full justify-end"
                message="Удалить файл?"
                onCancel={() => {
                  setConfirmId(null)
                }}
                onConfirm={() => {
                  confirmDelete(attachment)
                }}
              />
            ) : null}
          </li>
        ))}
        {uploads.map((item) => (
          <li key={item.key} className="flex flex-col gap-2 rounded-[14px] bg-surface-alt px-3.5 py-2.5">
            <div className="flex items-center gap-3">
              <FileText size={20} className="shrink-0 text-ink-60" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</p>
              <span className="text-xs text-ink-60">
                {item.progress === null ? 'Загрузка…' : `${String(Math.round(item.progress * 100))}%`}
              </span>
              <button
                type="button"
                aria-label={`Отменить загрузку: ${item.name}`}
                onClick={() => {
                  item.controller.abort()
                }}
                className="rounded text-[13px] font-semibold text-brand-red outline-none hover:underline"
              >
                Отменить
              </button>
            </div>
            <div
              role="progressbar"
              aria-label={`Загрузка: ${item.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.progress === null ? undefined : Math.round(item.progress * 100)}
              className="h-1 w-full overflow-hidden rounded-full bg-border"
            >
              <div
                className={cn('h-full rounded-full bg-brand-red', item.progress === null && 'w-1/2 animate-pulse')}
                style={item.progress === null ? undefined : { width: `${String(Math.round(item.progress * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {attachments.length === 0 && uploads.length === 0 ? (
        <p className="text-[13px] text-ink-60">Файлов пока нет. Перетащите файлы сюда или нажмите «Добавить файл».</p>
      ) : null}
    </section>
  )
}
