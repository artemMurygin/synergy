import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  agentSchema,
  archiveSchema,
  catalogSchema,
  pageSchema,
  profileSchema,
  requestSchema,
  roleSchema,
  skillSchema
} from './index'

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
    statusChangedAt: '2026-01-02T00:00:00.000Z',
    nextStatuses: ['in_dev'],
    archivedAt: null,
    products: [{ id: 'p1', slug: 'manager', name: 'Manager' }]
  }
  it('parses a skill', () => {
    const parsed = skillSchema.parse(skill)
    expect(parsed.requestsCount).toBe(2)
    expect(parsed.nextStatuses).toEqual(['in_dev'])
    expect(parsed.archivedAt).toBeNull()
  })
  it('accepts rework and an archive date', () => {
    const parsed = skillSchema.parse({ ...skill, status: 'rework', archivedAt: '2026-02-01T00:00:00.000Z' })
    expect(parsed.status).toBe('rework')
    expect(parsed.archivedAt).toBe('2026-02-01T00:00:00.000Z')
  })
  it('rejects an unknown next status', () => {
    expect(skillSchema.safeParse({ ...skill, nextStatuses: ['done'] }).success).toBe(false)
  })
  it('rejects an unknown status', () => {
    expect(skillSchema.safeParse({ ...skill, status: 'done' }).success).toBe(false)
  })
})

describe('agentSchema', () => {
  it('parses an agent with several products', () => {
    const agent = {
      id: 'a1',
      name: 'Ассистент',
      products: [
        { id: 'p1', slug: 'control-center', name: 'Control Center' },
        { id: 'p2', slug: 'telegram', name: 'Telegram-бот' }
      ]
    }
    expect(agentSchema.parse(agent).products.map((p) => p.name)).toEqual(['Control Center', 'Telegram-бот'])
  })
  it('rejects the old single product shape', () => {
    expect(agentSchema.safeParse({ id: 'a1', name: 'A', product: { id: 'p1', name: 'M' } }).success).toBe(false)
  })
})

describe('request status with rework', () => {
  it('accepts rework as a request status code', () => {
    const request = {
      id: 'r1',
      title: 't',
      description: '',
      frequency: { count: 1, period: 'day' },
      minutesPerRun: 1,
      peopleCount: 1,
      status: { code: 'rework', label: 'Доработка' },
      author: { id: 'u', login: 'l', fullName: 'F' },
      rejectReason: null,
      skill: null,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
    expect(requestSchema.parse(request).status.code).toBe('rework')
  })
})

describe('catalogSchema', () => {
  const product = { id: 'p1', slug: 'control-center', name: 'Control Center' }
  const catalog = {
    products: [
      {
        ...product,
        agents: [
          {
            id: 'a1',
            slug: 'assistant',
            name: 'Ассистент',
            status: { code: 'working', label: 'Работает' },
            products: [product],
            skills: [
              {
                id: 's1',
                name: 'Сверка',
                description: 'd',
                status: 'testing',
                statusChangedAt: '2026-01-02T00:00:00.000Z',
                nextStatuses: ['launched', 'rework']
              }
            ]
          }
        ]
      },
      { id: 'p2', slug: 'web', name: 'Веб', agents: [] }
    ]
  }
  it('parses a catalog response', () => {
    const parsed = catalogSchema.parse(catalog)
    expect(parsed.products[0].agents[0].status.code).toBe('working')
    expect(parsed.products[0].agents[0].skills[0].nextStatuses).toEqual(['launched', 'rework'])
    expect(parsed.products[1].agents).toEqual([])
  })
  it('rejects an unknown skill status', () => {
    const bad = structuredClone(catalog)
    bad.products[0].agents[0].skills[0].status = 'done'
    expect(catalogSchema.safeParse(bad).success).toBe(false)
  })
  it('rejects an unknown agent status code', () => {
    const bad = structuredClone(catalog)
    bad.products[0].agents[0].status.code = 'archived'
    expect(catalogSchema.safeParse(bad).success).toBe(false)
  })
})

describe('archiveSchema', () => {
  const product = { id: 'p1', slug: 'web', name: 'Веб' }
  const archive = {
    agents: [{ id: 'a1', name: 'Ассистент', products: [product], skillsCount: 3, archivedAt: '2026-02-01T00:00:00.000Z' }],
    skills: [
      {
        id: 's1',
        name: 'Сверка',
        agent: { id: 'a2', name: 'Бот' },
        products: [product],
        status: 'rework',
        archivedAt: '2026-02-02T00:00:00.000Z'
      }
    ]
  }
  it('parses an archive response', () => {
    const parsed = archiveSchema.parse(archive)
    expect(parsed.agents[0].skillsCount).toBe(3)
    expect(parsed.skills[0].status).toBe('rework')
  })
  it('rejects an unknown skill status', () => {
    const bad = structuredClone(archive)
    bad.skills[0].status = 'done'
    expect(archiveSchema.safeParse(bad).success).toBe(false)
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
