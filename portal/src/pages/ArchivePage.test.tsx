import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, queryWrapper, stubFetch, type FetchCall } from '@/test/helpers'
import { ArchivePage } from './ArchivePage'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mh = { id: 'p1', slug: 'manager-helper', name: 'Manager Helper' }
const cc = { id: 'p2', slug: 'control-center', name: 'Control Center' }
const full = {
  agents: [
    { id: 'a1', name: 'Сводка продаж', products: [cc, mh], skillsCount: 1, archivedAt: '2026-11-10T09:00:00.000Z' },
    { id: 'a2', name: 'Старый секретарь', products: [mh], skillsCount: 0, archivedAt: '2026-11-02T09:00:00.000Z' },
    { id: 'a3', name: 'Большой агент', products: [mh], skillsCount: 5, archivedAt: '2026-11-03T09:00:00.000Z' }
  ],
  skills: [
    { id: 's1', name: 'Отчёт по KPI', agent: { id: 'a1', name: 'Сводка продаж' }, products: [cc, mh], status: 'launched', archivedAt: '2026-11-10T09:00:00.000Z' },
    { id: 's2', name: 'Шаблон КП', agent: { id: 'a9', name: 'Помощник' }, products: [mh], status: 'planned', archivedAt: '2026-11-08T09:00:00.000Z' }
  ]
}

function renderPage() {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter>
        <ArchivePage />
      </MemoryRouter>
    </Wrapper>
  )
}

function api(initial: unknown, extra: (c: FetchCall) => Response | undefined = () => undefined) {
  let data = initial as typeof full
  return stubFetch((c) => {
    const custom = extra(c)
    if (custom) return custom
    if (c.path === '/portal/archive') return json(data)
    const restore = /^\/portal\/(agents|skills)\/([^/]+)\/restore$/.exec(c.path)
    if (restore && c.method === 'POST') {
      data = {
        agents: data.agents.filter((a) => !(restore[1] === 'agents' && a.id === restore[2])),
        skills: data.skills.filter((s) => !(restore[1] === 'skills' && s.id === restore[2]))
      }
      return restore[1] === 'agents'
        ? json({ id: restore[2], name: 'x', products: [mh] })
        : json({
            id: restore[2], name: 'x', description: '', status: 'planned', agent: { id: 'a9', name: 'x' }, requestsCount: 0,
            createdAt: '2026-11-01T09:00:00.000Z', statusChangedAt: '2026-11-01T09:00:00.000Z', products: [mh], nextStatuses: [], archivedAt: null
          })
    }
    return json({}, 404)
  })
}

describe('ArchivePage', () => {
  it('shows both lists with products, skills count, dates and restore buttons', async () => {
    api(full)
    renderPage()
    expect((await screen.findAllByText('Сводка продаж', { selector: 'p' })).length).toBeGreaterThan(0)
    expect(screen.getByText('1 навык вернётся вместе с агентом')).toBeTruthy()
    expect(screen.getByText('Навыков нет')).toBeTruthy()
    expect(screen.getByText('5 навыков вернутся вместе с агентом')).toBeTruthy()
    expect(screen.getAllByText('Control Center, Manager Helper').length).toBeGreaterThan(0)
    expect(screen.getAllByText('10.11.2026').length).toBeGreaterThan(0)
    expect(screen.getByText('Отчёт по KPI')).toBeTruthy()
    expect(screen.getByText('Шаблон КП')).toBeTruthy()
    expect(screen.getByText('Запущено')).toBeTruthy()
    expect(screen.getByText('Запланировано')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Восстановить/ })).toHaveLength(5)
  })

  it('removes an agent after restoring it', async () => {
    const user = userEvent.setup()
    const { calls } = api(full)
    renderPage()
    const row = (await screen.findByText('Старый секретарь')).closest('li') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /Восстановить/ }))
    expect(calls.some((c) => c.method === 'POST' && c.path === '/portal/agents/a2/restore')).toBe(true)
    await vi.waitFor(() => expect(screen.queryByText('Старый секретарь')).toBeNull())
    expect(screen.getAllByText('Сводка продаж', { selector: 'p' }).length).toBeGreaterThan(0)
  })

  it('removes a skill after restoring it', async () => {
    const user = userEvent.setup()
    api(full)
    renderPage()
    const row = (await screen.findByText('Шаблон КП')).closest('li') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /Восстановить/ }))
    await vi.waitFor(() => expect(screen.queryByText('Шаблон КП')).toBeNull())
  })

  it('shows empty states for both lists', async () => {
    api({ agents: [], skills: [] })
    renderPage()
    expect(await screen.findByText('Архивных агентов нет')).toBeTruthy()
    expect(screen.getByText('Архивных навыков нет')).toBeTruthy()
  })

  it('shows an alert when a skill cannot be restored because its agent is archived', async () => {
    const user = userEvent.setup()
    api(full, (c) =>
      c.path === '/portal/skills/s1/restore' ? json({ statusCode: 409, code: 'PORTAL_AGENT_ARCHIVED', message: 'agent archived' }, 409) : undefined
    )
    renderPage()
    const row = (await screen.findByText('Отчёт по KPI')).closest('li') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /Восстановить/ }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Сначала восстановите агента')).toBeTruthy()
    expect(screen.getByText('Отчёт по KPI')).toBeTruthy()
  })

  it('shows a load error with a retry', async () => {
    api(full, (c) => (c.path === '/portal/archive' ? json({ statusCode: 500, message: 'down' }, 500) : undefined))
    renderPage()
    expect(await screen.findByText('Не удалось загрузить архив')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
  })
})
