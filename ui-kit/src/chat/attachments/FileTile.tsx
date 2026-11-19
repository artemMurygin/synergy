import { AudioLines, CircleAlert, FileText } from '../../icons'
import { cn } from '../../lib/cn'
import type { FileKind } from './file-upload-port'
import { fileExt } from './file-ext'

type FileTileProps = {
  name: string
  kind: FileKind
  failed?: boolean
  /** Object URL of an image: the tile shows it instead of the icon. */
  previewUrl?: string | null
  className?: string
}

/** Square thumbnail of a file (Attachment Tile): type icon with the extension, or an image. */
export function FileTile({ name, kind, failed = false, previewUrl = null, className }: FileTileProps) {
  const Icon = failed ? CircleAlert : kind === 'recording' ? AudioLines : FileText
  return (
    <span
      className={cn(
        'flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[14px] border',
        failed ? 'border-brand-red/30 bg-brand-red-soft text-brand-red' : 'border-border bg-surface-alt text-ink-60',
        className,
      )}
    >
      {previewUrl !== null ? (
        <img src={previewUrl} alt={name} className="size-full object-cover" />
      ) : (
        <>
          <Icon size={20} />
          <span className="font-chat text-[10px] leading-3 font-semibold">{fileExt(name)}</span>
        </>
      )}
    </span>
  )
}
