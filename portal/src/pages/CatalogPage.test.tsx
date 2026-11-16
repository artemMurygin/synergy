import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import type { Role } from '@/lib/schemas'
import { catalogFixture } from '@/features/catalog/model/catalog.fixtures'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { CatalogPage } from './CatalogPage'

function signIn(roles: Role[]) {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles, fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
}
beforeEach(() => signIn([]))
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

  it('shows "Доступно: …" under a product with departments and nothing under one without', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    await screen.findByRole('heading', { name: 'Control Center' })
    expect(within(section('Control Center')).getByText('Доступно: КЦ 1, КЦ 2')).toBeTruthy()
    expect(within(section('Telegram-бот')).queryByText(/Доступно/)).toBeNull()
    expect(within(section('Веб')).queryByText(/Доступно/)).toBeNull()
  })

  it('has no "Доступ отделов" action and does not request departments without the admin role', async () => {
    for (const roles of [[], ['developer']] as Role[][]) {
      signIn(roles)
      const { calls } = stubFetch(() => json(catalogFixture))
      renderPage()
      await screen.findByRole('heading', { name: 'Control Center' })
      expect(screen.queryByRole('button', { name: 'Доступ отделов' })).toBeNull()
      expect(calls.some((c) => c.path === '/admin/departments')).toBe(false)
      cleanup()
    }
  })

  describe('admin', () => {
    const directory = [
      { id: 'd-kc1', name: 'КЦ 1', head: null, employeeCount: 3 },
      { id: 'd-kc2', name: 'КЦ 2', head: null, employeeCount: 2 }
    ]
    beforeEach(() => signIn(['admin']))

    it('has "Доступ отделов" on every product, also on one without agents', async () => {
      stubFetch((call) => (call.path === '/admin/departments' ? json(directory) : json(catalogFixture)))
      renderPage()
      await screen.findByRole('heading', { name: 'Control Center' })
      await waitFor(() => expect((within(section('Веб')).getByRole('button', { name: 'Доступ отделов' }) as HTMLButtonElement).disabled).toBe(false))
      expect(screen.getAllByRole('button', { name: 'Доступ отделов' })).toHaveLength(3)
    })

    it('assigns departments: PUT, the dialog closes and the label is reloaded', async () => {
      let saved = false
      const updated = {
        products: catalogFixture.products.map((p) => (p.id === 'p-web' ? { ...p, departments: [{ id: 'd-kc1', name: 'КЦ 1' }] } : p))
      }
      const { calls } = stubFetch((call) => {
        if (call.path === '/admin/departments') return json(directory)
        if (call.method === 'PUT') {
          saved = true
          return json({ id: 'p-web', slug: 'web', name: 'Веб', departments: [{ id: 'd-kc1', name: 'КЦ 1' }] })
        }
        return json(saved ? updated : catalogFixture)
      })
      renderPage()
      await screen.findByRole('heading', { name: 'Веб' })
      const button = within(section('Веб')).getByRole('button', { name: 'Доступ отделов' })
      await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
      await userEvent.click(button)
      await userEvent.click(await screen.findByRole('checkbox', { name: 'КЦ 1' }))
      await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      expect(await within(section('Веб')).findByText('Доступно: КЦ 1')).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/portal/products/p-web/departments', body: { departmentIds: ['d-kc1'] } })
    })
  })
})
