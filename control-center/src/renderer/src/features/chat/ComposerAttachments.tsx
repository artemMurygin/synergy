import { AlertCircle, AudioLines, FileText, RotateCw, X } from 'lucide-react'
import { useState, type DragEvent, type ReactNode } from 'react'
import { formatSize } from '@/lib/format-size'
import { cn } from '@/lib/utils'
import type { DraftAttachment } from './use-composer-attachments'

interface ComposerAttachmentsProps {
  items: readonly DraftAttachment[]
  onRemove: (key: string) => void
  onCancel: (key: string) => void
  onRetry: (key: string) => void
}

const ACTION =
  'flex size-8 shrink-0 items-center justify-center rounded-full text-ink-60 outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring'

/** Cards of the files attached to the draft, above the question field. */
export function ComposerAttachments({ items, onRemove, onCancel, onRetry }: ComposerAttachmentsProps) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Прикреплённые файлы" className="flex flex-wrap gap-2">
      {items.map((item) => {
        const failed = item.status === 'error'
        const uploading = item.status === 'uploading'
        const percent = Math.round(item.progress * 100)
        const Icon = failed ? AlertCircle : item.kind === 'recording' ? AudioLines : FileText
        return (
          <li
            key={item.key}
            className={cn(
              'flex min-h-[52px] max-w-80 items-center gap-3 rounded-md py-2 pr-2 pl-3.5',
              failed ? 'bg-brand-red-soft' : 'bg-surface-alt'
            )}
          >
            <Icon aria-hidden className={cn('size-5 shrink-0', failed ? 'text-brand-red' : 'text-ink-60')} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              {uploading && (
                <div className="flex items-center gap-2">
                  <div
                    role="progressbar"
                    aria-label={`Загрузка: ${item.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    className="h-1 w-24 overflow-hidden rounded-full bg-border"
                  >
                    <div className="h-full rounded-full bg-brand-red" style={{ width: `${String(percent)}%` }} />
                  </div>
                  <span className="text-xs text-ink-60">{`${String(percent)}%`}</span>
                </div>
              )}
              {failed && <p className="text-xs text-brand-red">{item.error}</p>}
              {item.status === 'ready' && <p className="text-xs text-ink-60">{formatSize(item.sizeBytes)}</p>}
            </div>
            {uploading && (
              <button
                type="button"
                aria-label={`Отменить загрузку: ${item.name}`}
                onClick={() => onCancel(item.key)}
                className={ACTION}
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
            {failed && item.canRetry && (
              <button
                type="button"
                aria-label={`Повторить: ${item.name}`}
                onClick={() => onRetry(item.key)}
                className={ACTION}
              >
                <RotateCw aria-hidden className="size-4" />
              </button>
            )}
            {!uploading && (
              <button type="button" aria-label={`Убрать: ${item.name}`} onClick={() => onRemove(item.key)} className={ACTION}>
                <X aria-hidden className="size-4" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer.types).includes('Files')

interface AttachmentDropZoneProps {
  onFiles: (files: File[]) => void
  /** Dropping is off, e.g. while the server still runs the agent. */
  disabled?: boolean
  children: ReactNode
}

/** The whole chat panel accepts dropped files; an overlay shows while a file is over it. */
export function AttachmentDropZone({ onFiles, disabled = false, children }: AttachmentDropZoneProps) {
  const [dragging, setDragging] = useState(false)

  const onDragOver = (event: DragEvent) => {
    if (disabled || !hasFiles(event)) return
    event.preventDefault()
    setDragging(true)
  }
  const onDragLeave = (event: DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
  }
  const onDrop = (event: DragEvent) => {
    if (disabled || !hasFiles(event)) return
    event.preventDefault()
    setDragging(false)
    onFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <section
      aria-label="Чат"
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface/80">
          <p className="text-sm font-semibold text-brand-red">Отпустите файлы, чтобы прикрепить</p>
        </div>
      )}
    </section>
  )
}
