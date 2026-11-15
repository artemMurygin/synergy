import { queryOptions } from '@tanstack/react-query'
import { CATALOG_KEY } from '@/lib/query-keys'
import { getCatalog } from './catalog.api'

export function catalogQuery() {
  return queryOptions({
    queryKey: CATALOG_KEY,
    queryFn: getCatalog,
    refetchOnMount: 'always'
  })
}
