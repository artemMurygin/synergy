import { useAui, useAuiState } from '@assistant-ui/react'
import { Composer, RunNotice, Thread, useComposerAttachments } from '@synergy/ui-kit'
import type { MessageFile } from '@synergy/ui-kit'
import { CircleAlert } from '@synergy/ui-kit/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { downloadFile } from '@/shared/files-api'
import { useFileUploadPort } from './attachments/use-file-upload-port'
import { useChatHistory } from './ChatRuntimeProvider'
import { DEFAULT_QUICK_SEARCH } from './quick-search/defaults'
import type { QuickSearchValues } from './quick-search/defaults'
import { QuickSearchButton } from './quick-search/QuickSearchButton'
import { QuickSearchSheet } from './quick-search/QuickSearchSheet'
import { useVoiceTranscriptionPort } from './voice/use-voice-transcription-port'

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
  /** Draft of the quick search form of this chat; without it the form keeps its own values. */
  quickSearchDraft?: { value: QuickSearchValues; onChange: (value: QuickSearchValues) => void }
  /** Search in the loaded messages (the button is in the header of the chat). */
  search?: { open: boolean; onClose: () => void }
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

/** Feed of the chat (UI kit Thread), the quick search sheet and the form of sending with attachments. */
export function ThreadView({
  serverRunning,
  onStopServerRun,
  onQuickSearch,
  onSendWithoutChat,
  quickSearchDraft,
  search,
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

  const voice = useVoiceTranscriptionPort()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [ownDraft, setOwnDraft] = useState<QuickSearchValues>(DEFAULT_QUICK_SEARCH)
  const draft = quickSearchDraft ?? { value: ownDraft, onChange: setOwnDraft }

  const running = localRunning || serverRunning
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

  const loadState = blocked ? (
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
    </div>
  ) : undefined

  // Without a chat Enter and the send button go to the panel: it creates the chat first.
  const interceptSend = onSendWithoutChat !== undefined

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface">
      <Thread
        serverRunning={serverRunning}
        isEditable={history.isEditable}
        onEdit={history.restartFrom}
        connection={history.connection}
        onProbe={history.probe}
        probing={history.probing}
        connectionHint="Проверьте адрес бэкенда в настройках расширения."
        search={search}
        onRetry={() => {
          if (lastMessage === undefined) return
          // The saved question is the restart point: the server does not keep a second copy of it.
          const asked = messages.filter((m) => m.role === 'user').at(-1)
          if (asked !== undefined) history.restartFrom(asked.id)
          aui.thread.message({ index: messages.length - 1 }).reload()
        }}
        onCancel={() => {
          if (localRunning) aui.thread.cancelRun()
          else onStopServerRun()
        }}
        onDownload={downloads.download}
        pendingDownloads={downloads.pending}
        empty={loadState}
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
              <Composer
                attachments={attachments}
                disabled={blocked}
                voice={voice}
                tools={
                  <QuickSearchButton
                    disabled={blocked || history.connection === 'offline'}
                    onClick={() => {
                      setSheetOpen(true)
                    }}
                  />
                }
              />
            </div>
          </>
        }
      />
      <QuickSearchSheet
        open={sheetOpen}
        value={draft.value}
        onChange={draft.onChange}
        pending={running}
        onSubmit={onQuickSearch}
        onOpenChange={setSheetOpen}
      />
    </div>
  )
}
