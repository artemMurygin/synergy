import { useQuery } from '@tanstack/react-query'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { CommentSubject } from '../model/comments.schema'
import { commentsQuery } from '../model/comments.queries'
import { CommentComposer } from './CommentComposer'
import { CommentList } from './CommentList'

function SkeletonBar({ className }: { className: string }) {
  return <span className={`block rounded-pill bg-surface-sunken motion-safe:animate-pulse ${className}`} />
}

/* Skeleton List: 3 items, avatar 32 + two lines */
function CommentsSkeleton() {
  const rows = [
    ['w-[120px]', 'w-full'],
    ['w-[150px]', 'w-[70%]'],
    ['w-[110px]', 'w-1/2']
  ]
  return (
    <div data-testid="comments-skeleton" role="status" aria-label="Загружаем комментарии" className="flex flex-col gap-5">
      {rows.map(([a, b], i) => (
        <div key={i} className="flex gap-3">
          <span className="size-8 shrink-0 rounded-full bg-surface-sunken motion-safe:animate-pulse" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            <SkeletonBar className={`h-2.5 max-w-full ${a}`} />
            <SkeletonBar className={`h-2.5 max-w-full ${b}`} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* Comments card: padding 24 (20 on mobile), gap 20 (18), head with title and count */
export function CommentsSection({ subject = 'requests', subjectId }: { subject?: CommentSubject; subjectId: string }) {
  const query = useQuery(commentsQuery(subject, subjectId))
  const isInitialLoad = query.isPending
  const items = query.data?.items ?? []

  return (
    <section aria-labelledby={`comments-${subject}-${subjectId}`} className="flex flex-col gap-[18px] rounded-lg border border-border bg-surface p-5 min-[900px]:gap-5 min-[900px]:p-6">
      <div className="flex items-center gap-2">
        <h2 id={`comments-${subject}-${subjectId}`} className="text-[13px] font-bold leading-[15px] text-ink">
          Комментарии
        </h2>
        {items.length > 0 ? <span className="text-[13px] font-semibold leading-[15px] text-ink-60">{items.length}</span> : null}
      </div>
      {isInitialLoad ? <CommentsSkeleton /> : null}
      {query.isError && !query.data ? (
        <Alert title="Не удалось загрузить комментарии">
          <div className="flex flex-col items-start gap-2">
            <span>Проверьте соединение и попробуйте ещё раз.</span>
            <Button variant="ghost" className="h-auto p-0 text-[13px] font-semibold text-brand-red" onClick={() => void query.refetch()}>
              Повторить
            </Button>
          </div>
        </Alert>
      ) : null}
      {query.data && items.length === 0 ? (
        <p className="flex items-center gap-3 rounded-md bg-surface-alt px-[18px] py-4 text-sm text-ink-60">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          </svg>
          Комментариев пока нет. Задайте вопрос или уточните детали
        </p>
      ) : null}
      {items.length > 0 ? <CommentList subject={subject} subjectId={subjectId} comments={items} /> : null}
      <CommentComposer subject={subject} subjectId={subjectId} />
    </section>
  )
}
