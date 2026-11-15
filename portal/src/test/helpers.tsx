import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'
import { vi } from 'vitest'
import type { SkillStatus } from '@/lib/schemas'

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export function createTestClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

export function queryWrapper(client: QueryClient = createTestClient()) {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

export interface FetchCall {
  method: string
  path: string
  search: string
  body: unknown
}

/** Stubs global fetch with a route handler and records every call. */
export function stubFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const parsed = new URL(url)
    const call: FetchCall = {
      method: init?.method ?? 'GET',
      path: parsed.pathname,
      search: parsed.search,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
    }
    calls.push(call)
    return Promise.resolve(handler(call))
  })
  vi.stubGlobal('fetch', fn)
  return { calls, fn }
}

export const requestFixture = {
  id: '3f0c2d9e-7a31-4c55-9a52-1f6d8b0e4a11',
  title: 'Сверка актов',
  description: 'Сверяю акты вручную',
  frequency: { count: 5, period: 'week' as const },
  minutesPerRun: 20,
  peopleCount: 3,
  status: { code: 'under_review' as const, label: 'На рассмотрении' },
  author: { id: 'u1', login: 'ivan', fullName: 'Иванов Иван Иванович' },
  reviewer: { id: 'd1', login: 'dev', fullName: 'Петров Пётр' } as { id: string; login: string; fullName: string } | null,
  takenAt: '2026-11-11T09:00:00.000Z' as string | null,
  effortHours: null as number | null,
  rejectReason: null,
  skill: null,
  createdAt: '2026-11-10T09:00:00.000Z'
}

export const skillFixture = {
  id: 's1',
  name: 'Сводка встречи',
  description: 'Делает сводку',
  status: 'planned' as const,
  agent: { id: 'a1', name: 'Ассистент' },
  requestsCount: 2,
  createdAt: '2026-11-01T09:00:00.000Z',
  statusChangedAt: '2026-11-02T09:00:00.000Z',
  products: [{ id: 'p1', slug: 'manager-helper', name: 'Manager Helper' }],
  nextStatuses: ['in_dev' as SkillStatus],
  archivedAt: null as string | null
}

export const agentFixture = { id: 'a1', name: 'Ассистент', products: [{ id: 'p1', slug: 'manager-helper', name: 'Manager Helper' }] }

export const page = <T,>(items: T[], pageNo = 0) => ({ items, total: items.length, limit: 20, page: pageNo })
