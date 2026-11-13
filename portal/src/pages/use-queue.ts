import { useQuery } from '@tanstack/react-query'
import { queueQuery } from '@/features/decision'

export function useQueue(page: number) {
  return useQuery(queueQuery(page))
}
