import { cn } from '@/lib/utils'
import { FileCard } from './FileCard'
import { useFileDownloads } from './file-downloads'
import type { MessageFile } from './message-files'

interface MessageAttachmentsProps {
  files: readonly MessageFile[]
  /** Side of the bubble the cards line up with. */
  align?: 'start' | 'end'
}

/** Files of a chat message as cards; a click downloads the file under its original name. */
export function MessageAttachments({ files, align = 'start' }: MessageAttachmentsProps) {
  const { download, pending } = useFileDownloads()
  if (files.length === 0) return null
  return (
    <ul
      aria-label="Файлы сообщения"
      className={cn('flex w-full max-w-[85%] flex-col gap-2', align === 'end' ? 'items-end self-end' : 'items-start self-start')}
    >
      {files.map((file) => (
        <li key={file.id} className="w-full max-w-90">
          <FileCard file={file} downloading={pending.has(file.id)} onDownload={download} />
        </li>
      ))}
    </ul>
  )
}
