import type { Comment, CommentSubject } from '../model/comments.schema'
import { CommentItem } from './CommentItem'

/* Comment List: vertical, gap 20; items arrive oldest first */
export function CommentList({ subject, subjectId, comments }: { subject: CommentSubject; subjectId: string; comments: Comment[] }) {
  return (
    <ul className="flex flex-col gap-5">
      {comments.map((comment) => (
        <CommentItem key={comment.id} subject={subject} subjectId={subjectId} comment={comment} />
      ))}
    </ul>
  )
}
