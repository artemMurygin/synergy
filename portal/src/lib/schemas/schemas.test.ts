import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { agentSchema, pageSchema, profileSchema, requestSchema, roleSchema, skillSchema } from './index'

const request = {
  id: 'r1',
  title: 'Сверка актов',
  description: 'Сверяю акты вручную',
  frequency: { count: 5, period: 'week' },
  minutesPerRun: 20,
  peopleCount: 3,
  status: { code: 'pending', label: 'На рассмотрении' },
  author: { id: 'u1', login: 'anna', fullName: 'Иванова Анна' },
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
  const base = {
    id: 'u1',
    login: 'dev',
    mustChangePassword: false,
    roles: ['developer'],
    fullName: 'Иванов Иван Иванович',
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Иванович',
    position: 'Аналитик',
    department: { id: 'd1', name: 'Бухгалтерия' }
  }

  it('parses a profile with roles, name parts, position and department', () => {
    const p = profileSchema.parse(base)
    expect(p.roles).toEqual(['developer'])
    expect(p.fullName).toBe('Иванов Иван Иванович')
    expect(p.lastName).toBe('Иванов')
    expect(p.position).toBe('Аналитик')
    expect(p.department).toEqual({ id: 'd1', name: 'Бухгалтерия' })
  })

  it('accepts the admin role', () => {
    expect(profileSchema.parse({ ...base, roles: ['admin', 'developer'] }).roles).toEqual(['admin', 'developer'])
    expect(roleSchema.parse('admin')).toBe('admin')
  })

  it('parses a profile without name parts, position and department', () => {
    const p = profileSchema.parse({
      ...base,
      fullName: 'dev',
      lastName: null,
      firstName: null,
      middleName: null,
      position: null,
      department: null
    })
    expect(p.fullName).toBe('dev')
    expect(p.department).toBeNull()
    expect(p.middleName).toBeNull()
  })

  it('rejects an unknown role, a missing roles field and a missing fullName', () => {
    expect(profileSchema.safeParse({ ...base, roles: ['root'] }).success).toBe(false)
    expect(profileSchema.safeParse({ ...base, roles: undefined }).success).toBe(false)
    expect(profileSchema.safeParse({ ...base, fullName: undefined }).success).toBe(false)
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
