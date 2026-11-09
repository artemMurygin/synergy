import { Skeleton } from '@/components/ui/skeleton'

const WIDTHS = ['w-[220px]', 'w-[180px]', 'w-[220px]', 'w-[180px]', 'w-[220px]']

export function ChatListSkeleton() {
  return (
    <div role="status" aria-label="Загрузка чатов">
      {WIDTHS.map((width, index) => (
        <div key={index} className="flex flex-col gap-2 border-b p-4">
          <Skeleton className={`h-3.5 max-w-full ${width}`} />
          <Skeleton className="h-2.5 w-[90px]" />
        </div>
      ))}
    </div>
  )
}
