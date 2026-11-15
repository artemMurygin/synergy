import type { QueryClient } from '@tanstack/react-query'
import { employeeQuery, EMPLOYEES_KEY } from './employees.queries'

/** Reloads the list and the card of one employee. */
export function refreshEmployee(client: QueryClient, id: string): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
    client.invalidateQueries({ queryKey: employeeQuery(id).queryKey })
  ])
}
