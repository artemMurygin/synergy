import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { catalogFixture } from '@/features/catalog/model/catalog.fixtures'
import type { Role } from '@/lib/schemas'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { AgentPage } from './AgentPage'

function signIn(roles: Role[]) {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles, fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
}

beforeEach(() => signIn([]))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage(id: string) {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter initialEntries={[`/catalog/agents/${id}`]}>
        <Routes>
          <Route path="/catalog/agents/:id" element={<AgentPage />} />
          <Route path="/catalog" element={<p>catalog screen</p>} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

describe('AgentPage', () => {
  it('shows the agent with all its products, status and skills with badge and date', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage('a-assistant')
    expect(screen.getByText('Загружаем агента…')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Ассистент' })).toBeTruthy()
    expect(screen.getByText('Control Center, Telegram-бот')).toBeTruthy()
    expect(screen.getByText('Работает')).toBeTruthy()
    const row = screen.getByText('Сводка встречи').closest('li')!
    expect(within(row).getByText('Запущено')).toBeTruthy()
    expect(within(row).getByText(/02\.11\.2026/)).toBeTruthy()
    expect(within(row).getByText('Сводка встречи — описание')).toBeTruthy()
    expect(screen.getByText('Запланировано')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Каталог/ }).getAttribute('href')).toBe('/catalog')
  })

  it('shows the empty state for an agent without skills', async () => {
    const empty = { ...catalogFixture.products[0]!.agents[1]!, skills: [], status: { code: 'in_development' as const, label: 'В разработке' } }
    stubFetch(() => json({ products: [{ ...catalogFixture.products[0]!, agents: [empty] }] }))
    renderPage('a-analyst')
    expect(await screen.findByText('Навыков пока нет')).toBeTruthy()
    expect(screen.getByText('В разработке')).toBeTruthy()
  })

  it('shows "Агент не найден" with a link to the catalog for an unknown or archived id', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage('gone')
    expect(await screen.findByRole('heading', { name: 'Агент не найден' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'К каталогу' }).getAttribute('href')).toBe('/catalog')
  })

  it('shows a retry on a load error', async () => {
    stubFetch(() => json({ message: 'x' }, 500))
    renderPage('a-assistant')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
  })

  it('hides the archive action from an employee and shows it to a developer', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage('a-assistant')
    await screen.findByRole('heading', { name: 'Ассистент' })
    expect(screen.queryByRole('button', { name: 'Архивировать агента' })).toBeNull()
    cleanup()
    signIn(['developer'])
    renderPage('a-assistant')
    expect(await screen.findByRole('button', { name: 'Архивировать агента' })).toBeTruthy()
  })

  it('offers "Сообщить о проблеме" to an employee and a developer, the link carries the agent', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage('a-assistant')
    const link = await screen.findByRole('link', { name: 'Сообщить о проблеме' })
    expect(link.getAttribute('href')).toBe('/bugs/new?agentId=a-assistant')
    expect(screen.queryByRole('button', { name: 'Архивировать агента' })).toBeNull()
    cleanup()
    signIn(['developer'])
    renderPage('a-assistant')
    const devLink = await screen.findByRole('link', { name: 'Сообщить о проблеме' })
    const archive = screen.getByRole('button', { name: 'Архивировать агента' })
    expect(devLink.parentElement).toBe(archive.parentElement)
    expect(devLink.compareDocumentPosition(archive) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('encodes the agent id in the link', async () => {
    const agent = { ...catalogFixture.products[0]!.agents[0]!, id: 'a b&c' }
    stubFetch(() => json({ products: [{ ...catalogFixture.products[0]!, agents: [agent] }] }))
    renderPage(encodeURIComponent('a b&c'))
    const link = await screen.findByRole('link', { name: 'Сообщить о проблеме' })
    expect(link.getAttribute('href')).toBe('/bugs/new?agentId=a%20b%26c')
  })
})
