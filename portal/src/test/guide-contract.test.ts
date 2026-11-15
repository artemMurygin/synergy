import { describe, expect, it } from 'vitest'
import { productDepartmentsAnswerSchema } from '@/features/catalog/model/catalog.api'
import { guideResponseSchema } from '@/features/guides/model/guides.schema'
import { catalogSchema } from '@/lib/schemas'
import catalogResponse from './contract/catalog-departments-response.json'
import guideResponses from './contract/guide-responses.json'
import productDepartments from './contract/product-departments-response.json'

// The fixtures are verified against the real backend in
// backend/src/modules/portal/interface/http/guides-contract.spec.ts.
describe('guide and product access backend contract', () => {
  it.each(guideResponses.map((item) => [item.name, item.response] as const))(
    'guideResponseSchema parses the backend response for %s guide',
    (_name, response) => {
      const parsed = guideResponseSchema.safeParse(response)
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
      expect(parsed.data).toEqual(response)
    }
  )

  it('keeps the author of a filled guide and nulls of an empty one', () => {
    const [filled, empty] = guideResponses.map((item) => guideResponseSchema.parse(item.response))
    expect(filled?.updatedBy?.fullName).toBe('Петров Пётр')
    expect(filled?.body).toContain('<script>')
    expect(empty).toEqual({ body: null, updatedAt: null, updatedBy: null })
  })

  it('productDepartmentsAnswerSchema parses the PUT .../departments response', () => {
    const parsed = productDepartmentsAnswerSchema.safeParse(productDepartments)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    expect(parsed.data?.departments.map((d) => d.name)).toEqual(['КЦ 1', 'КЦ 2'])
  })

  it('catalogSchema parses a catalog with departments on products and agent product refs', () => {
    const parsed = catalogSchema.safeParse(catalogResponse)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    expect(parsed.data).toEqual(catalogResponse)
    expect(parsed.data?.products[0]?.agents[0]?.products[0]?.departments).toHaveLength(2)
    expect(parsed.data?.products[1]?.departments).toEqual([])
  })
})
