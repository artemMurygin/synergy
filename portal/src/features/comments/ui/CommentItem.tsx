import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/format'
import { COMMENT_EDIT_EXPIRED_MESSAGE, commentErrorMessage } from '../model/comments.errors'
import type { Comment } from '../model/comments.schema'
import { useEditComment } from '../model/use-edit-comment'
import { COMMENT_MAX_LENGTH, LIMIT_MESSAGE } from './comment-limits'

const ROLE_MARK = {
  request_author: { label: 'Автор заявки', tone: 'neutral' },
  developer: { label: 'Разработчик', tone: 'info' }
} as const

/* Comment Item / Master: avatar 32, name 14/600, role mark, time 12 ink-60, text 14/1.55 ink-80 */
export function CommentItem({ requestId, comment }: { requestId: string; comment: Comment }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [expired, setExpired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const edit = useEditComment(requestId)
  const role = ROLE_MARK[comment.authorRole]
  const tooLong = draft.length > COMMENT_MAX_LENGTH
  const canSave = draft.trim().length > 0 && !tooLong && !edit.isPending

  function startEdit() {
    setDraft(comment.body)
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setDraft(comment.body)
    setError(null)
    setEditing(false)
  }

  function save() {
    if (!canSave) return
    setError(null)
    edit.mutate(
      { commentId: comment.id, body: draft },
      {
        onSuccess: () => setEditing(false),
        onError: (e) => {
          if (e.status === 409) {
            setExpired(true)
            setDraft(comment.body)
            setEditing(false)
          } else {
            setError(commentErrorMessage(e))
          }
        }
      }
    )
  }

  return (
    <li className="flex gap-3">
      <PersonAvatar fullName={comment.author.fullName} className="size-8 text-xs" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{comment.author.fullName}</span>
            <Badge tone={role.tone} hideDot className="shrink-0 px-2 py-[3px]">
              {role.label}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink-60">
            <span>{formatDateTime(comment.createdAt)}</span>
            {comment.editedAt ? <span>· изменено</span> : null}
            {comment.canEdit && !expired && !editing ? (
              <button type="button" onClick={startEdit} className="flex items-center gap-1 pl-1.5 font-semibold text-ink-80 hover:text-ink">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[13px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.2 5.6 18.4 2.8a2 2 0 0 0-2.8 0L3 15.4V21h5.6L21.2 8.4a2 2 0 0 0 0-2.8Z" />
                  <path d="m15 5 4 4" />
                </svg>
                Изменить
              </button>
            ) : null}
          </div>
        </div>
        {editing ? (
          <div className="flex flex-col gap-2.5 pt-1">
            <Textarea
              label="Текст комментария"
              hideLabel
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={tooLong || undefined}
              className="h-24 min-h-24 border-ink px-3.5 py-3 text-sm leading-[1.45]"
            />
            {tooLong ? <p className="text-xs font-medium text-brand-red">{LIMIT_MESSAGE}</p> : null}
            {error ? <Alert>{error}</Alert> : null}
            <div className="flex items-center gap-2">
              <Button size="sm" className="px-4 text-sm" disabled={!canSave} onClick={save}>
                Сохранить
              </Button>
              <Button size="sm" variant="outline" className="px-4 text-sm" onClick={cancel}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words text-sm leading-[1.55] text-ink-80">{comment.body}</p>
            {expired ? <Alert tone="warning" title={COMMENT_EDIT_EXPIRED_MESSAGE} /> : null}
          </>
        )}
      </div>
    </li>
  )
}
