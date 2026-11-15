import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { catalogFixture } from '@/features/catalog/model/catalog.fixtures'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { CatalogPage } from './CatalogPage'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage() {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter initialEntries={['/catalog']}>
        <Routes>
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/agents/:id" element={<Link to="/catalog">card</Link>} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

const section = (name: string) => screen.getByRole('region', { name })

describe('CatalogPage', () => {
  it('shows the loading state, then the products', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    expect(screen.getByText('Загружаем каталог…')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Control Center' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Telegram-бот' })).toBeTruthy()
  })

  it('shows an agent of two products in both sections, with "Также в" only for it', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    await screen.findByRole('heading', { name: 'Control Center' })
    expect(within(section('Control Center')).getByText('Также в: Telegram-бот')).toBeTruthy()
    expect(within(section('Telegram-бот')).getByText('Также в: Control Center')).toBeTruthy()
    expect(within(section('Control Center')).getAllByText(/Также в/)).toHaveLength(1)
    expect(within(section('Telegram-бот')).getAllByRole('link')[0]?.getAttribute('href')).toBe('/catalog/agents/a-assistant')
  })

  it('renders a tile with name, status badge, skills count and the link to the card', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    await screen.findByRole('heading', { name: 'Control Center' })
    const tile = within(section('Control Center')).getByRole('link', { name: /Аналитик звонков/ })
    expect(tile.getAttribute('href')).toBe('/catalog/agents/a-analyst')
    expect(within(tile).getByText('В разработке')).toBeTruthy()
    expect(within(tile).getByText('1 навык')).toBeTruthy()
    expect(within(tile).queryByText(/Также в/)).toBeNull()
    const assistant = within(section('Control Center')).getByRole('link', { name: /Ассистент/ })
    expect(within(assistant).getByText('Работает')).toBeTruthy()
    expect(within(assistant).getByText('2 навыка')).toBeTruthy()
  })

  it('stretches the tiles of a row to the same height', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    await screen.findByRole('heading', { name: 'Control Center' })
    const tile = within(section('Control Center')).getByRole('link', { name: /Аналитик звонков/ })
    expect(tile.className).toContain('h-full')
    expect(tile.parentElement?.className).toContain('grid')
  })

  it('marks a product without agents', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    await screen.findByRole('heading', { name: 'Веб' })
    expect(within(section('Веб')).getByText('Агентов пока нет')).toBeTruthy()
  })

  it('opens the agent card from a tile', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: /Аналитик звонков/ }))
    expect(await screen.findByText('card')).toBeTruthy()
  })

  it('shows an error with a retry that reloads the catalog', async () => {
    let fail = true
    const { fn } = stubFetch(() => (fail ? json({ message: 'Сбой' }, 500) : json(catalogFixture)))
    renderPage()
    await screen.findByRole('button', { name: 'Повторить' })
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('heading', { name: 'Control Center' })).toBeTruthy()
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
