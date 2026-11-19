import { useState, type DragEvent, type ReactNode } from 'react'
import { RotateCw, X } from '../../icons'
import { cn } from '../../lib/cn'
import { FileTile } from './FileTile'
import { formatSize } from './format-size'
import type { DraftAttachment } from './use-composer-attachments'

type ComposerAttachmentsProps = {
  items: readonly DraftAttachment[]
  onRemove: (key: string) => void
  onCancel: (key: string) => void
  onRetry: (key: string) => void
}

const CORNER =
  'absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border border-border bg-surface text-ink-60 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-red/40'

/** Tiles of the files attached to the draft, above the question field. */
export function ComposerAttachments({ items, onRemove, onCancel, onRetry }: ComposerAttachmentsProps) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Прикреплённые файлы" className="flex flex-wrap gap-2 px-0.5">
      {items.map((item) => {
        const failed = item.status === 'error'
        const uploading = item.status === 'uploading'
        const percent = Math.round(item.progress * 100)
        return (
          <li key={item.key} className="flex max-w-60 items-center gap-2">
            <span className="relative shrink-0">
              <FileTile name={item.name} kind={item.kind} failed={failed} previewUrl={item.previewUrl} />
              <button
                type="button"
                aria-label={
                  uploading ? `Отменить загрузку: ${item.name}` : `Убрать: ${item.name}`
                }
                onClick={() => {
                  if (uploading) onCancel(item.key)
                  else onRemove(item.key)
                }}
                className={CORNER}
              >
                <X size={12} />
              </button>
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-chat text-[13px] font-medium text-ink">{item.name}</span>
              {uploading && (
                <span className="flex items-center gap-2">
                  <span
                    role="progressbar"
                    aria-label={`Загрузка: ${item.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    className="h-1 w-16 overflow-hidden rounded-full bg-border"
                  >
                    <span className="block h-full rounded-full bg-brand-red" style={{ width: `${String(percent)}%` }} />
                  </span>
                  <span className="text-xs text-ink-60">{`${String(percent)}%`}</span>
                </span>
              )}
              {failed && <span className="text-xs text-brand-red">{item.error}</span>}
              {item.status === 'ready' && <span className="text-xs text-ink-60">{formatSize(item.sizeBytes)}</span>}
              {failed && item.canRetry && (
                <button
                  type="button"
                  aria-label={`Повторить: ${item.name}`}
                  onClick={() => {
                    onRetry(item.key)
                  }}
                  className="flex items-center gap-1 self-start text-xs font-semibold text-brand-red outline-none hover:underline"
                >
                  <RotateCw size={12} />
                  Повторить
                </button>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer.types).includes('Files')

/** Handlers that make an element accept dropped files; `dragging` is true while a file is over it. */
export function useFileDrop(onFiles: (files: File[]) => void, disabled = false) {
  const [dragging, setDragging] = useState(false)
  const onDragOver = (event: DragEvent) => {
    if (disabled || !hasFiles(event)) return
    event.preventDefault()
    setDragging(true)
  }
  const onDragLeave = (event: DragEvent) => {
    const related = event.relatedTarget
    if (!(related instanceof Node) || !event.currentTarget.contains(related)) setDragging(false)
  }
  const onDrop = (event: DragEvent) => {
    if (disabled || !hasFiles(event)) return
    event.preventDefault()
    setDragging(false)
    onFiles(Array.from(event.dataTransfer.files))
  }
  return { dragging, handlers: { onDragEnter: onDragOver, onDragOver, onDragLeave, onDrop } }
}

type AttachmentDropZoneProps = {
  onFiles: (files: File[]) => void
  /** Dropping is off, e.g. while the server still runs the agent. */
  disabled?: boolean
  className?: string
  children: ReactNode
}

/** An area that accepts dropped files; an overlay shows while a file is over it. */
export function AttachmentDropZone({ onFiles, disabled = false, className, children }: AttachmentDropZoneProps) {
  const { dragging, handlers } = useFileDrop(onFiles, disabled)
  return (
    <section aria-label="Чат" {...handlers} className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface/80">
          <p className="text-sm font-semibold text-brand-red">Отпустите файлы, чтобы прикрепить</p>
        </div>
      )}
    </section>
  )
}
