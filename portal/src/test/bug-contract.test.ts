import { describe, expect, it } from 'vitest'
import { bugListItemSchema, bugResponseSchema, bugsPageSchema, BUG_STATUSES } from '@/features/bugs/model/bugs.schema'
import { commentListSchema } from '@/features/comments/model/comments.schema'
import bugListResponse from './contract/bug-list-response.json'
import bugResponses from './contract/bug-responses.json'
import bugCommentResponses from './contract/bug-comment-responses.json'

// The fixtures are verified against the real backend in
// backend/src/modules/portal/interface/http/bug-contract.spec.ts.
describe('bug backend contract', () => {
  it.each(bugResponses.map((item) => [item.name, item.response] as const))(
    'bugResponseSchema parses the backend response for %s',
    (_name, response) => {
      const parsed = bugResponseSchema.safeParse(response)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
      expect(parsed.data).toEqual(response)
    }
  )

  it('covers every status and keeps wontFixReason, statusChangedBy and nextStatuses', () => {
    const parsed = bugResponses.map((item) => bugResponseSchema.parse(item.response))
    expect(new Set(parsed.map((bug) => bug.status))).toEqual(new Set(BUG_STATUSES))
    const wontFix = parsed.find((bug) => bug.status === 'wont_fix')
    expect(wontFix?.wontFixReason).toBe('Дубль\nпервого бага')
    expect(wontFix?.statusChangedBy?.login).toBe('petrov')
    expect(wontFix?.nextStatuses).toEqual(['in_progress'])
    expect(parsed.find((bug) => bug.status === 'open')?.statusChangedBy).toBeNull()
  })

  it('the list response parses as a page of list items', () => {
    const parsed = bugsPageSchema.safeParse(bugListResponse)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    expect(parsed.data?.items).toHaveLength(2)
    expect(parsed.data?.items.every((item) => bugListItemSchema.safeParse(item).success)).toBe(true)
  })

  it('commentListSchema parses the bug comment feed with bug_author and developer roles', () => {
    const parsed = commentListSchema.safeParse(bugCommentResponses)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    expect(parsed.data?.items.map((c) => c.authorRole)).toEqual(['bug_author', 'developer'])
  })
})
