import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ApiError } from '@/lib/errors'
import type { IdeaRequest } from '@/lib/schemas'
import { submitRequest } from './requests.api'
import { MY_REQUESTS_KEY } from './requests.queries'
import type { RequestBody } from './requests.schema'

/** Submits an idea; the form keeps its values because the hook never resets them on failure. */
export function useSubmitRequest(): UseMutationResult<IdeaRequest, ApiError, RequestBody> {
  const client = useQueryClient()
  return useMutation<IdeaRequest, ApiError, RequestBody>({
    mutationFn: submitRequest,
    onSuccess: () => client.invalidateQueries({ queryKey: MY_REQUESTS_KEY })
  })
}
