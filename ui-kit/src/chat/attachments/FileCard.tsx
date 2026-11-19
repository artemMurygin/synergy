import { Download, Loader } from '../../icons'
import { cn } from '../../lib/cn'
import type { MessageFile } from './file-upload-port'
import { FileTile } from './FileTile'
import { formatSize } from './format-size'

export const EXPIRED_TEXT = 'Срок хранения истёк'

type FileCardProps = {
  file: MessageFile
  /** The file is being downloaded: a spinner instead of the icon, no second download. */
  downloading?: boolean
  onDownload?: (file: MessageFile) => void
}

const ROW = 'flex w-full max-w-90 items-center gap-3 rounded-lg bg-surface-alt p-1 pr-3 text-left'

/** A file of a chat message: tile, name, size and the download action. */
export function FileCard({ file, downloading = false, onDownload }: FileCardProps) {
  if (file.status === 'deleted') {
    return (
      <div aria-disabled="true" className={cn(ROW, 'cursor-default opacity-60')}>
        <FileTile name={file.name} kind={file.kind} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{file.name}</p>
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
      className={cn(ROW, 'outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40')}
    >
      <FileTile name={file.name} kind={file.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{file.name}</span>
        <span className="block text-xs text-ink-60">{formatSize(file.sizeBytes)}</span>
      </span>
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center text-ink-60">
        {downloading ? <Loader className="animate-spin" size={16} /> : <Download size={16} />}
      </span>
    </button>
  )
}
