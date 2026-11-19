import { cn } from '../../lib/cn'
import type { MessageFile } from './file-upload-port'
import { FileCard } from './FileCard'

type MessageAttachmentsProps = {
  files: readonly MessageFile[]
  /** Ids of the files being downloaded. */
  pending?: ReadonlySet<string>
  onDownload: (file: MessageFile) => void
  /** Side of the bubble the cards line up with. */
  align?: 'start' | 'end'
}

/** Files of a chat message as cards; a click downloads the file under its original name. */
export function MessageAttachments({ files, pending, onDownload, align = 'start' }: MessageAttachmentsProps) {
  if (files.length === 0) return null
  return (
    <ul
      aria-label="Файлы сообщения"
      className={cn(
        'flex w-full max-w-[85%] flex-col gap-2',
        align === 'end' ? 'items-end self-end' : 'items-start self-start',
      )}
    >
      {files.map((file) => (
        <li key={file.id} className="w-full max-w-90">
          <FileCard file={file} downloading={pending?.has(file.id) ?? false} onDownload={onDownload} />
        </li>
      ))}
    </ul>
  )
}
