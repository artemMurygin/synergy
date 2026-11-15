import { useQuery } from '@tanstack/react-query'
import { catalogQuery } from '@/features/catalog'

/** The whole catalog; the loading state is only the very first load (isInitialLoad). */
export function useCatalog() {
  const query = useQuery(catalogQuery())
  return { ...query, isInitialLoad: query.isPending }
}
