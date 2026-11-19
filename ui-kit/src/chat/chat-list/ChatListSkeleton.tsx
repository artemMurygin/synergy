import { Skeleton } from '../../primitives/Skeleton'

const WIDTHS = ['w-44', 'w-32', 'w-48', 'w-36', 'w-40']

/** Chat List Item · Skeleton rows while the list loads. */
export function ChatListSkeleton() {
  return (
    <div role="status" aria-label="Загрузка чатов" className="flex flex-col gap-1">
      {WIDTHS.map((width, index) => (
        <div key={index} className="flex h-9 items-center gap-3 px-3">
          <Skeleton className={`h-3 max-w-full ${width}`} />
          <Skeleton className="ml-auto h-2.5 w-8" />
        </div>
      ))}
    </div>
  )
}
