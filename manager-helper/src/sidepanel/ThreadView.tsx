import { useAui, useAuiState } from '@assistant-ui/react'
import { Composer, RunNotice, Thread, useComposerAttachments } from '@synergy/ui-kit'
import type { MessageFile } from '@synergy/ui-kit'
import { CircleAlert } from '@synergy/ui-kit/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { downloadFile } from '@/shared/files-api'
import { useFileUploadPort } from './attachments/use-file-upload-port'
import { useChatHistory } from './ChatRuntimeProvider'
import { isFormOpen } from './form-visibility'
import { QuickSearchForm } from './QuickSearchForm'

interface Props {
  /** The server still runs the agent of this chat (the panel came back to a run in progress). */
  serverRunning: boolean
  /** Cancels that run on the server: it is not a local run of the runtime. */
  onStopServerRun: () => void
  /** Receives the query and a short chat title built from the form parameters. */
  onQuickSearch: (query: string, title: string) => void
  /**
   * Set while the panel has no chat: the question goes here instead of the runtime, which has
   * no chat to run in; the uploaded files go along. Resolves to `false` when it was not taken (the text stays in the field).
   */
  onSendWithoutChat?: (text: string, files: MessageFile[]) => Promise<boolean>
}

function answerText(content: readonly { type: string; text?: string }[]): string {
  return content.map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('')
}

/** The run was refused because an attached file is deleted: `HTTP 410: File <id> is deleted`. */
function goneFileId(error: string): string | null | undefined {
  if (!/\bHTTP 410\b/.test(error)) return undefined
  return /File (\S+?) is deleted/.exec(error)?.[1] ?? null
}

function useFileDownloads() {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const [failedName, setFailedName] = useState<string | null>(null)
  const download = useCallback((file: MessageFile) => {
    setFailedName(null)
    setPending((ids) => new Set(ids).add(file.id))
    downloadFile(file.id, file.name)
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
  }, [])
  const dismiss = useCallback(() => {
    setFailedName(null)
  }, [])
  return { pending, failedName, download, dismiss }
}

/** Feed of the chat (UI kit Thread), quick search form and the form of sending with attachments. */
export function ThreadView({
  serverRunning,
  onStopServerRun,
  onQuickSearch,
  onSendWithoutChat,
}: Props) {
  const aui = useAui()
  const history = useChatHistory()
  const messages = useAuiState((s) => s.thread.messages)
  const localRunning = useAuiState((s) => s.thread.isRunning)
  const lastMessage = messages.at(-1)
  const lastStatus = lastMessage?.role === 'assistant' ? lastMessage.status : undefined
  const failed = lastStatus?.type === 'incomplete' && lastStatus.reason === 'error'
  const attachments = useComposerAttachments(useFileUploadPort())
  const downloads = useFileDownloads()

  // Agent-reply count at which the user re-opened the form; -1 means not re-opened.
  const [openedAt, setOpenedAt] = useState(-1)
  const agentCount = messages.filter((m) => m.role === 'assistant').length
  const formOpen = isFormOpen(agentCount, openedAt)

  const running = localRunning || serverRunning
  const showContent = history.status === 'ready' || history.status === 'idle'
  const blocked = history.status === 'loading' || history.status === 'error'

  // The run was refused because a sent file expired: its card comes back failed.
  const lastError = failed && typeof lastStatus.error === 'string' ? lastStatus.error : ''
  const lastId = lastMessage?.id
  const { restoreExpired } = attachments
  useEffect(() => {
    const gone = goneFileId(lastError)
    if (lastId === undefined || gone === undefined) return
    restoreExpired(gone)
  }, [lastId, lastError, restoreExpired])

  // The composer empties on send: when the run fails the question goes back into it.
  const restored = useRef('')
  const question = messages.filter((m) => m.role === 'user').at(-1)
  const questionText = question === undefined ? '' : answerText(question.content)
  useEffect(() => {
    if (!failed || questionText === '' || aui.composer.getState().text !== '') return
    restored.current = questionText
    aui.composer.setText(questionText)
  }, [failed, questionText, aui])
  // A retry sends the question again: the restored copy must not stay behind.
  useEffect(() => {
    if (
      localRunning &&
      restored.current !== '' &&
      aui.composer.getState().text === restored.current
    ) {
      aui.composer.setText('')
    }
    if (localRunning) restored.current = ''
  }, [localRunning, aui])

  const composerText = useAuiState((s) => s.composer.text)
  const submitWithoutChat = () => {
    const text = composerText.trim()
    const ready = attachments.items.filter((item) => item.status === 'ready' && item.fileId !== null)
    if (onSendWithoutChat === undefined || attachments.isUploading) return
    if (text === '' && ready.length === 0) return
    attachments.dismissNotice()
    const files = ready.map(
      (item): MessageFile => ({
        id: item.fileId ?? '',
        name: item.name,
        mediaType: item.mediaType,
        kind: item.kind,
        sizeBytes: item.sizeBytes,
        status: 'active',
      }),
    )
    void onSendWithoutChat(text, files).then((taken) => {
      if (!taken) return
      attachments.take()
      aui.composer.setText('')
    })
  }

  const empty = (
    <div className="m-auto flex max-w-xs flex-col items-center gap-2 text-center">
      {history.status === 'loading' && <p className="text-sm text-ink-60">Загружаем историю…</p>}
      {history.status === 'error' && (
        <>
          <p className="text-sm text-ink-60">Не удалось загрузить историю чата</p>
          <button
            type="button"
            className="rounded-full bg-surface-alt px-4 py-1.5 text-sm font-semibold text-ink hover:bg-surface-sunken"
            onClick={history.reload}
          >
            Повторить
          </button>
        </>
      )}
      {showContent && (
        <p className="text-sm text-ink-60">
          Задайте вопрос по ценам, программам и условиям поступления или заполните форму ниже.
        </p>
      )}
    </div>
  )

  // Without a chat Enter and the send button go to the panel: it creates the chat first.
  const interceptSend = onSendWithoutChat !== undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <Thread
        serverRunning={serverRunning}
        onRetry={() => {
          if (lastMessage !== undefined) aui.thread.message({ index: messages.length - 1 }).reload()
        }}
        onCancel={() => {
          if (localRunning) aui.thread.cancelRun()
          else onStopServerRun()
        }}
        onDownload={downloads.download}
        pendingDownloads={downloads.pending}
        empty={empty}
        composer={
          <>
            {downloads.failedName !== null && (
              <RunNotice
                tone="error"
                role="alert"
                icon={<CircleAlert size={18} />}
                title="Не удалось скачать файл"
                text={downloads.failedName}
                actionLabel="Закрыть"
                onAction={downloads.dismiss}
              />
            )}
            {showContent && (
              <div className={running ? 'opacity-50' : undefined}>
                <QuickSearchForm
                  open={formOpen}
                  onToggle={() => {
                    setOpenedAt(formOpen ? -1 : agentCount)
                  }}
                  pending={running}
                  onSubmit={(query, title) => {
                    setOpenedAt(-1)
                    onQuickSearch(query, title)
                  }}
                />
              </div>
            )}
            <div
              onSubmitCapture={
                interceptSend
                  ? (event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      submitWithoutChat()
                    }
                  : undefined
              }
              onKeyDownCapture={
                interceptSend
                  ? (event) => {
                      if (
                        event.key === 'Enter' &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing &&
                        event.target instanceof HTMLTextAreaElement
                      ) {
                        event.preventDefault()
                        event.stopPropagation()
                        submitWithoutChat()
                      }
                    }
                  : undefined
              }
            >
              <Composer attachments={attachments} disabled={blocked} />
            </div>
          </>
        }
      />
    </div>
  )
}
