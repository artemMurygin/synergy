import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { agentSchema, pageSchema, profileSchema, requestSchema, skillSchema } from './index'

const request = {
  id: 'r1',
  title: 'Сверка актов',
  description: 'Сверяю акты вручную',
  frequency: { count: 5, period: 'week' },
  minutesPerRun: 20,
  peopleCount: 3,
  status: { code: 'pending', label: 'На рассмотрении' },
  author: { id: 'u1', login: 'anna' },
  rejectReason: null,
  skill: null,
  createdAt: '2026-01-01T00:00:00.000Z'
}

describe('requestSchema', () => {
  it('parses a pending request', () => {
    expect(requestSchema.parse(request).status.code).toBe('pending')
  })

  it('parses a rejected request with a reason', () => {
    const parsed = requestSchema.parse({
      ...request,
      status: { code: 'rejected', label: 'Отклонена' },
      rejectReason: 'Уже есть'
    })
    expect(parsed.rejectReason).toBe('Уже есть')
  })

  it('parses an accepted request with its skill', () => {
    const parsed = requestSchema.parse({
      ...request,
      status: { code: 'in_dev', label: 'В разработке' },
      skill: { id: 's1', name: 'Сверка', description: 'd' }
    })
    expect(parsed.skill?.name).toBe('Сверка')
  })

  it('rejects an unknown status code or period', () => {
    expect(requestSchema.safeParse({ ...request, status: { code: 'x', label: 'x' } }).success).toBe(false)
    expect(requestSchema.safeParse({ ...request, frequency: { count: 1, period: 'year' } }).success).toBe(false)
  })
})

describe('skillSchema', () => {
  const skill = {
    id: 's1',
    name: 'Сверка',
    description: '',
    status: 'planned',
    agent: { id: 'a1', name: 'Ассистент' },
    requestsCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    statusChangedAt: '2026-01-02T00:00:00.000Z'
  }
  it('parses a skill', () => {
    expect(skillSchema.parse(skill).requestsCount).toBe(2)
  })
  it('rejects an unknown status', () => {
    expect(skillSchema.safeParse({ ...skill, status: 'done' }).success).toBe(false)
  })
})

describe('agentSchema', () => {
  it('parses an agent with its product', () => {
    const agent = { id: 'a1', name: 'Ассистент', product: { id: 'p1', name: 'Manager' } }
    expect(agentSchema.parse(agent).product.name).toBe('Manager')
  })
})

describe('profileSchema', () => {
  it('parses a profile with roles', () => {
    const p = profileSchema.parse({ id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'] })
    expect(p.roles).toEqual(['developer'])
  })
  it('rejects an unknown role and a missing roles field', () => {
    expect(profileSchema.safeParse({ id: 'u1', login: 'x', mustChangePassword: false, roles: ['admin'] }).success).toBe(false)
    expect(profileSchema.safeParse({ id: 'u1', login: 'x', mustChangePassword: false }).success).toBe(false)
  })
})

describe('pageSchema', () => {
  const schema = pageSchema(z.object({ id: z.string() }))
  it('parses a page', () => {
    expect(schema.parse({ items: [{ id: 'a' }], total: 1, limit: 20, page: 0 }).total).toBe(1)
  })
  it('rejects a page without total', () => {
    expect(schema.safeParse({ items: [], limit: 20, page: 0 }).success).toBe(false)
  })
})
