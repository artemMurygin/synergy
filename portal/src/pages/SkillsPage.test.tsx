import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { agentFixture, createTestClient, json, page, queryWrapper, skillFixture, stubFetch, type FetchCall } from '@/test/helpers'
import { SkillsPage } from './SkillsPage'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const planned = { ...skillFixture, id: 's1', name: 'Сводка встречи' }
const inDev = { ...skillFixture, id: 's2', name: 'Сверка актов', status: 'in_dev' as const }

function renderPage() {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter>
        <SkillsPage />
      </MemoryRouter>
    </Wrapper>
  )
}

function api(extra: (c: FetchCall) => Response | undefined = () => undefined) {
  return stubFetch((c) => {
    if (c.path === '/portal/agents') return json([agentFixture])
    const custom = extra(c)
    if (custom) return custom
    if (c.path === '/portal/skills') {
      const status = new URLSearchParams(c.search).get('status')
      return json(page([planned, inDev].filter((s) => !status || s.status === status)))
    }
    return json({}, 404)
  })
}

describe('SkillsPage', () => {
  it('lists the skills', async () => {
    api()
    renderPage()
    expect(await screen.findByText('Сводка встречи')).toBeTruthy()
    expect(screen.getByText('Сверка актов')).toBeTruthy()
  })

  it('the "В разработке" filter shows only such skills', async () => {
    const { calls } = api()
    renderPage()
    await screen.findByText('Сводка встречи')
    await userEvent.click(within(screen.getByRole('group', { name: 'Статус навыка' })).getByRole('button', { name: /^В разработке/ }))
    await vi.waitFor(() => expect(screen.queryByText('Сводка встречи')).toBeNull())
    expect(screen.getByText('Сверка актов')).toBeTruthy()
    expect(calls.some((c) => c.search.includes('status=in_dev'))).toBe(true)
  })

  it('changes the status of a skill', async () => {
    let moved = false
    const { calls } = api((c) => {
      if (c.method === 'POST' && c.path === '/portal/skills/s1/status') {
        moved = true
        return json({ ...planned, status: 'in_dev' })
      }
      if (moved && c.path === '/portal/skills') return json(page([{ ...planned, status: 'in_dev' }]))
    })
    renderPage()
    const row = (await screen.findByText('Сводка встречи')).closest('tr') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: 'В разработку' }))
    await vi.waitFor(() => expect(within(screen.getByText('Сводка встречи').closest('tr')!).getByText('В разработке')).toBeTruthy())
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ status: 'in_dev' })
  })

  it('a 409 shows the message and the actual state', async () => {
    let conflict = false
    api((c) => {
      if (c.method === 'POST') {
        conflict = true
        return json({ message: 'conflict' }, 409)
      }
      if (conflict && c.path === '/portal/skills') return json(page([{ ...planned, status: 'testing' }]))
    })
    renderPage()
    const row = (await screen.findByText('Сводка встречи')).closest('tr') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: 'В разработку' }))
    expect(await screen.findByText(/Статус навыка уже изменён/)).toBeTruthy()
    await vi.waitFor(() => expect(within(screen.getByText('Сводка встречи').closest('tr')!).getByText('Тестируется')).toBeTruthy())
  })

  it('the product filter keeps a skill when one of the agent products is chosen', async () => {
    stubFetch((c) =>
      c.path === '/portal/agents'
        ? json([{ ...agentFixture, products: [...agentFixture.products, { id: 'p2', slug: 'telegram', name: 'Telegram-бот' }] }])
        : json(page([planned, inDev]))
    )
    renderPage()
    await screen.findByText('Сводка встречи')
    await vi.waitFor(() => expect(screen.getAllByText('Manager Helper, Telegram-бот').length).toBe(2))
    await userEvent.selectOptions(screen.getByLabelText('Продукт'), 'p2')
    expect(screen.getByText('Сводка встречи')).toBeTruthy()
    expect(screen.getByText('Сверка актов')).toBeTruthy()
  })

  it('archives a skill after confirmation and it disappears from the list', async () => {
    let archived = false
    const { calls } = api((c) => {
      if (c.method === 'POST' && c.path === '/portal/skills/s1/archive') {
        archived = true
        return json({ ...planned, archivedAt: '2026-11-10T09:00:00.000Z' })
      }
      if (archived && c.path === '/portal/skills') return json(page([inDev]))
    })
    renderPage()
    await screen.findByText('Сводка встречи')
    await userEvent.click(screen.getByRole('button', { name: 'Архивировать навык «Сводка встречи»' }))
    await userEvent.click(screen.getByRole('button', { name: 'Архивировать' }))
    await vi.waitFor(() => expect(screen.queryByText('Сводка встречи')).toBeNull())
    expect(calls.some((c) => c.method === 'POST' && c.path === '/portal/skills/s1/archive')).toBe(true)
  })

  it('shows an error with a retry', async () => {
    stubFetch((c) => (c.path === '/portal/agents' ? json([agentFixture]) : json({ message: 'Сбой' }, 500)))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Повторить' })).toBeTruthy()
  })
})
