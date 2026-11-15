import { queryOptions } from '@tanstack/react-query'
import { ARCHIVE_KEY } from '@/lib/query-keys'
import { getArchive } from './archive.api'

export function archiveQuery() {
  return queryOptions({
    queryKey: ARCHIVE_KEY,
    queryFn: getArchive,
    refetchOnMount: 'always'
  })
}
