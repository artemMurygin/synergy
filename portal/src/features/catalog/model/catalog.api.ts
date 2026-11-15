import { authorizedRequest } from '@/features/auth'
import { catalogSchema, type Catalog } from '@/lib/schemas'

export function getCatalog(): Promise<Catalog> {
  return authorizedRequest('/portal/catalog', { schema: catalogSchema })
}
