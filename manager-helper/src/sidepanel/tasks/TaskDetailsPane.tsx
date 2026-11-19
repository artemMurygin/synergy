import { Button, Skeleton, TaskDetails } from '@synergy/ui-kit'
import type { TaskPatch, TaskStatus } from '@synergy/ui-kit'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TaskNotFoundError, TaskUserNotFoundError, deleteTask, getTask, updateTask } from '@/shared/tasks-api'
import type { TaskDetails as TaskDetailsData, UpdateTaskInput, UserSummary } from '@/shared/tasks-api'
import { messageOf } from './messages'
import { useTaskAttachments } from './use-task-attachments'
import { useUserSearch } from './use-user-search'

const USER_NOT_FOUND_TEXT = 'Пользователь не найден или отключён'

interface Props {
  taskId: string
  me: UserSummary
  /** Omitted when the list is always visible next to the details (tablet). */
  onBack?: () => void
  /** The task changed on the server: the list is stale. */
  onChanged: () => void
  /** The server no longer has the task (404). */
  onMissing: (taskId: string) => void
  /** The task was deleted from here. */
  onDeleted: (taskId: string) => void
}

/** Container of the package `TaskDetails`: loads the task, saves the edits, owns the attachments. */
export function TaskDetailsPane({ taskId, me, onBack, onChanged, onMissing, onDeleted }: Props) {
  const [task, setTask] = useState<TaskDetailsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const userSearch = useUserSearch()
  const latest = useRef(0)

  const load = useCallback(
    async (quiet = false) => {
      const id = ++latest.current
      if (!quiet) {
        setLoading(true)
        setLoadError(null)
      }
      try {
        const loaded = await getTask(taskId)
        if (id === latest.current) setTask(loaded)
      } catch (failure) {
        if (id !== latest.current) return
        if (failure instanceof TaskNotFoundError) onMissing(taskId)
        else if (!quiet) setLoadError(messageOf(failure))
      } finally {
        if (id === latest.current) setLoading(false)
      }
    },
    [taskId, onMissing],
  )

  useEffect(() => {
    Promise.resolve().then(() => load(), () => undefined)
    return () => {
      latest.current += 1
    }
  }, [load])

  const apply = async (patch: UpdateTaskInput) => {
    setMessage(null)
    try {
      const updated = await updateTask(taskId, patch)
      // PATCH answers without the attachments: keep the loaded ones.
      setTask((current) => ({ ...updated, attachments: current?.attachments ?? [] }))
      onChanged()
    } catch (failure) {
      if (failure instanceof TaskNotFoundError) onMissing(taskId)
      else if (failure instanceof TaskUserNotFoundError) setMessage(USER_NOT_FOUND_TEXT)
      else setMessage(`Не удалось сохранить: ${messageOf(failure)}`)
    }
  }

  const attachments = useTaskAttachments({
    taskId,
    attachments: task?.attachments ?? [],
    onChanged: () => {
      void load(true)
      onChanged()
    },
  })

  if (loading && task === null) {
    return (
      <div role="status" aria-label="Загрузка задачи" className="flex flex-col gap-4 p-6 pt-16">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (task === null) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 p-6 text-sm">
        <p className="text-brand-red">{loadError ?? 'Не удалось загрузить задачу'}</p>
        <Button variant="secondary" onClick={() => void load()}>
          Повторить
        </Button>
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            Назад
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <TaskDetails
      task={task}
      me={me}
      userSearch={userSearch}
      message={message}
      onBack={onBack}
      onPatch={(patch: TaskPatch) => void apply(patch)}
      onStatus={(status: TaskStatus) => {
        if (status !== task.status) void apply({ status })
      }}
      onUpload={attachments.onUpload}
      onDeleteAttachment={attachments.onDelete}
      onDownload={attachments.onDownload}
      maxBytes={attachments.maxBytes}
      maxFiles={attachments.maxFiles}
      onDelete={() => {
        deleteTask(taskId).then(
          () => {
            onDeleted(taskId)
          },
          (failure: unknown) => {
            if (failure instanceof TaskNotFoundError) onMissing(taskId)
            else setMessage(`Не удалось удалить задачу: ${messageOf(failure)}`)
          },
        )
      }}
    />
  )
}
