import { Button, Skeleton, TaskDetails, TaskNotFound, useToast, type TaskPatch } from '@synergy/ui-kit'
import { X } from '@synergy/ui-kit/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionStore } from '@/features/auth/session.store'
import {
  AttachmentLimitError,
  AttachmentTooLargeError,
  BackendError,
  TaskNotFoundError,
  TaskUserNotFoundError
} from '@/lib/backend/errors'
import * as tasksApi from '@/lib/backend/tasks.api'
import {
  useDeleteAttachment,
  useDeleteTask,
  useTask,
  useUpdateTask,
  useUploadAttachment
} from '@/lib/backend/tasks.queries'
import type { TaskStatus } from '@/lib/backend/tasks.schema'
import { saveBlob } from '@/lib/save-blob'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'
import { USER_NOT_FOUND_TEXT } from './CreateTaskDialog'
import { fieldErrorsFromError } from './field-errors'
import { useUserSearch } from './use-user-search'

const GONE_NOTICE_MS = 5000
const TOO_LARGE_TEXT = 'Файл слишком большой: максимум 20 МБ'
const LIMIT_TEXT = 'Достигнут лимит: не больше 10 файлов на задачу'
// a column beside the list (not an overlay): the list narrows while the panel is open (frame qryQB)
const PANEL_CLASS =
  'relative flex h-full w-105 shrink-0 flex-col overflow-hidden rounded-[20px] bg-surface shadow-panel outline-none'

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError'

function uploadFailure(error: unknown): Error {
  if (error instanceof AttachmentTooLargeError) return new Error(TOO_LARGE_TEXT, { cause: error })
  if (error instanceof AttachmentLimitError) return new Error(LIMIT_TEXT, { cause: error })
  return new Error(error instanceof BackendError ? error.message : 'Не удалось загрузить файл', { cause: error })
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Закрыть панель"
      onClick={onClose}
      className="absolute top-3.5 right-3 z-10 flex size-9 items-center justify-center rounded-full text-ink-60 outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40"
    >
      <X />
    </button>
  )
}

function GoneNotice({ onClose }: { onClose: () => void }) {
  const notice = useNotificationsStore((s) => s.notice)
  useEffect(() => {
    const timer = setTimeout(onClose, GONE_NOTICE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [onClose])
  return (
    <aside role="complementary" aria-label="Детали задачи" className={PANEL_CLASS}>
      <CloseButton onClose={onClose} />
      <TaskNotFound
        onBack={onClose}
        text={
          notice === null
            ? 'Её удалил другой пользователь. Список обновлён.'
            : 'Её удалили или у вас больше нет к ней доступа. Уведомление отмечено прочитанным.'
        }
      />
    </aside>
  )
}

interface BodyProps {
  id: string
  onOpen: () => void
  onGone: () => void
}

function DetailsBody({ id, onOpen, onGone }: BodyProps) {
  const query = useTask(id)
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const upload = useUploadAttachment()
  const removeAttachment = useDeleteAttachment()
  const toast = useToast()
  const userSearch = useUserSearch()
  const me = useSessionStore((s) => s.snapshot.user)
  const selectTask = useTasksStore((s) => s.selectTask)
  const panel = useRef<HTMLElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const notFound = query.error instanceof TaskNotFoundError

  const close = () => {
    selectTask(null)
    document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)?.focus()
  }
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  useEffect(() => {
    onOpen()
    panel.current?.focus()
  }, [onOpen])

  useEffect(() => {
    if (notFound) onGone()
  }, [notFound, onGone])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // the panel stays mounted but hidden in the chats section: Escape there is not ours
      if (useUiStore.getState().section !== 'tasks') return
      // Escape belongs to an open dialog, menu or list first
      if (document.querySelector('[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"]')) return
      closeRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const handleFailure = (error: unknown, fallback: string) => {
    if (error instanceof TaskNotFoundError) onGone()
    else setMessage(error instanceof BackendError ? error.message : fallback)
  }

  const patch = (change: TaskPatch) => {
    setMessage(null)
    update.mutateAsync({ id, patch: change }).catch((error: unknown) => {
      const found = fieldErrorsFromError(error)
      if (error instanceof TaskUserNotFoundError) setMessage(USER_NOT_FOUND_TEXT)
      else if (found) setMessage(Object.values(found)[0] ?? 'Не удалось сохранить изменения')
      else handleFailure(error, 'Не удалось сохранить изменения')
    })
  }

  const changeStatus = (status: TaskStatus) => {
    setMessage(null)
    update.mutateAsync({ id, patch: { status } }).catch((error: unknown) => {
      handleFailure(error, 'Не удалось изменить статус. Он возвращён к прежнему.')
    })
  }

  const task = query.data
  const failed = query.isError && !notFound

  return (
    <aside ref={panel} tabIndex={-1} role="complementary" aria-label="Детали задачи" className={PANEL_CLASS}>
      <CloseButton onClose={close} />
      {query.isPending && (
        <div role="status" aria-label="Загрузка задачи" className="flex flex-col gap-4 p-6 pt-16">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-7/12" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {failed && (
        <div role="alert" className="flex flex-col items-start gap-3 p-6 pt-16 text-sm">
          <p className="text-brand-red">Не удалось загрузить задачу.</p>
          <Button
            variant="secondary"
            onClick={() => {
              void query.refetch()
            }}
          >
            Повторить
          </Button>
        </div>
      )}
      {task && (
        <TaskDetails
          task={task}
          me={me ? { id: me.id, login: me.login } : undefined}
          userSearch={userSearch}
          message={message}
          onPatch={patch}
          onStatus={changeStatus}
          onUpload={async (file, { onProgress, signal }) => {
            try {
              await upload.mutateAsync({ taskId: id, file, options: { signal, onProgress } })
            } catch (error) {
              if (isAbort(error)) throw error
              throw uploadFailure(error)
            }
          }}
          onDeleteAttachment={async (attachment) => {
            try {
              await removeAttachment.mutateAsync({ taskId: id, attachmentId: attachment.id })
            } catch (error) {
              throw new Error(error instanceof BackendError ? error.message : 'Не удалось удалить файл', { cause: error })
            }
          }}
          onDownload={async (attachment) => {
            try {
              const { blob, fileName } = await tasksApi.downloadAttachment(id, attachment.id)
              saveBlob(blob, fileName)
            } catch (error) {
              throw new Error(error instanceof BackendError ? error.message : 'Не удалось скачать файл', { cause: error })
            }
          }}
          onDelete={() => {
            remove
              .mutateAsync(id)
              .then(() => {
                toast.show({ tone: 'success', title: `Задача «${task.title}» удалена и убрана из списка` })
              })
              .catch((error: unknown) => {
                handleFailure(error, 'Не удалось удалить задачу')
              })
          }}
        />
      )}
    </aside>
  )
}

/** Right-hand panel with the selected task; renders nothing while no task is selected. */
export function TaskDetailsPanel() {
  const id = useTasksStore((s) => s.selectedTaskId)
  // set when the open task turned out to be deleted: the panel stays to say so, then closes itself
  const [gone, setGone] = useState(false)
  const onOpen = useCallback(() => {
    setGone(false)
    useNotificationsStore.getState().clearNotice()
  }, [])
  const onGone = useCallback(() => {
    setGone(true)
  }, [])

  if (id === null) return gone ? <GoneNotice onClose={onOpen} /> : null
  return <DetailsBody key={id} id={id} onOpen={onOpen} onGone={onGone} />
}
