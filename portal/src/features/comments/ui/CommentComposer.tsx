import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { CommentSubject } from '../model/comments.schema'
import { usePostComment } from '../model/use-post-comment'
import { COMMENT_MAX_LENGTH, LIMIT_MESSAGE } from './comment-limits'

/* Composer: top border, 20 top padding, textarea 96, footer with hint and send button (h-40) */
export function CommentComposer({ subject, subjectId }: { subject: CommentSubject; subjectId: string }) {
  const [text, setText] = useState('')
  const [failed, setFailed] = useState(false)
  const post = usePostComment(subject, subjectId)
  const tooLong = text.length > COMMENT_MAX_LENGTH
  const canSend = text.trim().length > 0 && !tooLong && !post.isPending

  function send() {
    if (!canSend) return
    setFailed(false)
    post.mutate(text.trim(), {
      onSuccess: () => setText(''),
      onError: () => setFailed(true)
    })
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-border pt-5">
      {failed ? <Alert title="Не удалось отправить комментарий">Текст остался в поле — отправьте его ещё раз.</Alert> : null}
      <Textarea
        label="Новый комментарий"
        hideLabel
        placeholder="Напишите комментарий…"
        value={text}
        disabled={post.isPending}
        aria-invalid={tooLong || undefined}
        onChange={(e) => setText(e.target.value)}
        className="h-24 min-h-24 px-3.5 py-3 disabled:bg-surface-alt disabled:text-ink-60 disabled:opacity-100"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {tooLong ? (
          <p className="text-xs font-medium text-brand-red">{LIMIT_MESSAGE}</p>
        ) : null}
        <p className="hidden text-xs text-ink-60 sm:block">Комментарий увидят {subject === 'bugs' ? 'автор обращения' : 'автор заявки'} и разработчики</p>
        <div className="hidden flex-1 sm:block" />
        {tooLong ? (
          <span className="text-xs font-semibold text-brand-red">{`${text.length.toLocaleString('ru-RU')} / ${String(COMMENT_MAX_LENGTH)}`}</span>
        ) : null}
        <Button
          className="h-10 w-full px-[18px] text-sm disabled:border disabled:border-border disabled:bg-surface-alt sm:w-auto"
          disabled={!canSend}
          onClick={send}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {post.isPending ? <path d="M21 12a9 9 0 1 1-6.2-8.6" className="animate-spin origin-center" /> : <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>}
          </svg>
          {post.isPending ? 'Отправляем…' : 'Отправить'}
        </Button>
      </div>
    </div>
  )
}
