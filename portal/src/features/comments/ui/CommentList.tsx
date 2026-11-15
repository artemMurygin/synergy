import type { Comment } from '../model/comments.schema'
import { CommentItem } from './CommentItem'

/* Comment List: vertical, gap 20; items arrive oldest first */
export function CommentList({ requestId, comments }: { requestId: string; comments: Comment[] }) {
  return (
    <ul className="flex flex-col gap-5">
      {comments.map((comment) => (
        <CommentItem key={comment.id} requestId={requestId} comment={comment} />
      ))}
    </ul>
  )
}
