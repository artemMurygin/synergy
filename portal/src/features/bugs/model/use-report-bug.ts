import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import { CATALOG_KEY } from '@/lib/query-keys'
import { reportBug } from './bugs.api'
import { MY_BUGS_KEY } from './bugs.queries'
import type { BugResponse, ReportBugBody } from './bugs.schema'

/** Reports a bug; the form keeps its values on failure. A 409 (archived agent) reloads the catalog. */
export function useReportBug(): UseMutationResult<BugResponse, ApiError, ReportBugBody> {
  const client = useQueryClient()
  return useMutation<BugResponse, ApiError, ReportBugBody>({
    mutationFn: reportBug,
    onSuccess: () => client.invalidateQueries({ queryKey: MY_BUGS_KEY }),
    onError: (error) => {
      if (error.kind === 'conflict') return client.invalidateQueries({ queryKey: CATALOG_KEY })
    }
  })
}
