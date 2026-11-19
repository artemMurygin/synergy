import { AudioLines, Download, FileText, Loader2 } from 'lucide-react'
import { formatSize } from '@/lib/format-size'
import { cn } from '@/lib/utils'
import type { MessageFile } from './message-files'

export const EXPIRED_TEXT = 'Срок хранения истёк'

interface FileCardProps {
  file: MessageFile
  /** The file is being downloaded: a spinner instead of the icon, no second download. */
  downloading?: boolean
  onDownload?: (file: MessageFile) => void
}

const ROW = 'flex min-h-[52px] w-full max-w-90 items-center gap-3 rounded-md bg-surface-alt py-2 pr-2 pl-3.5 text-left'

/** A file of a chat message, drawn like the attachment row of a task. */
export function FileCard({ file, downloading = false, onDownload }: FileCardProps) {
  const Icon = file.kind === 'recording' ? AudioLines : FileText

  if (file.status === 'deleted') {
    return (
      <div aria-disabled="true" className={cn(ROW, 'cursor-default text-ink opacity-60')}>
        <Icon aria-hidden className="size-5 shrink-0 text-ink-60" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-ink-60">{EXPIRED_TEXT}</p>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      aria-label={`Скачать ${file.name}`}
      aria-busy={downloading}
      onClick={() => {
        if (!downloading) onDownload?.(file)
      }}
      className={cn(
        ROW,
        'text-ink outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40'
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0 text-ink-60" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{file.name}</span>
        <span className="block text-xs text-ink-60">{formatSize(file.sizeBytes)}</span>
      </span>
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-60">
        {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      </span>
    </button>
  )
}
