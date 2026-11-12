import { CircleAlert } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useDownloadFile } from '@/lib/backend/files.queries'
import type { MessageFile } from './message-files'
import { RunNotice } from './RunNotice'

export const DOWNLOAD_FAILED_TITLE = 'Не удалось скачать файл'

interface FileDownloads {
  download: (file: MessageFile) => void
  /** Ids of the files being downloaded. */
  pending: ReadonlySet<string>
  /** Name of the file whose download failed last; null when none. */
  failedName: string | null
  dismiss: () => void
}

const FileDownloadsContext = createContext<FileDownloads | null>(null)

/** Downloads of the files of one chat feed and the error notice above it. */
export function FileDownloadsProvider({ children }: { children: ReactNode }) {
  const { mutateAsync } = useDownloadFile()
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const [failedName, setFailedName] = useState<string | null>(null)

  const download = useCallback(
    (file: MessageFile) => {
      setFailedName(null)
      setPending((ids) => new Set(ids).add(file.id))
      mutateAsync({ id: file.id, name: file.name })
        .catch(() => {
          setFailedName(file.name)
        })
        .finally(() => {
          setPending((ids) => {
            const next = new Set(ids)
            next.delete(file.id)
            return next
          })
        })
    },
    [mutateAsync]
  )

  const dismiss = useCallback(() => {
    setFailedName(null)
  }, [])

  const value = useMemo(() => ({ download, pending, failedName, dismiss }), [download, pending, failedName, dismiss])
  return <FileDownloadsContext.Provider value={value}>{children}</FileDownloadsContext.Provider>
}

export function useFileDownloads(): FileDownloads {
  const value = useContext(FileDownloadsContext)
  if (value === null) throw new Error('useFileDownloads must be used inside FileDownloadsProvider')
  return value
}

/** Error notice above the feed: the download of a file failed. */
export function DownloadErrorNotice() {
  const { failedName, dismiss } = useFileDownloads()
  if (failedName === null) return null
  return (
    <RunNotice
      tone="error"
      role="alert"
      icon={<CircleAlert className="size-4" />}
      title={DOWNLOAD_FAILED_TITLE}
      text={failedName}
      actionLabel="Закрыть"
      onAction={dismiss}
    />
  )
}
