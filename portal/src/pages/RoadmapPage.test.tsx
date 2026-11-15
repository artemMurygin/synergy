import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { catalogFixture } from '@/features/catalog/model/catalog.fixtures'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { RoadmapPage } from './RoadmapPage'

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
      <MemoryRouter initialEntries={['/roadmap']}>
        <Routes>
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/catalog/agents/:id" element={<Link to="/roadmap">agent card</Link>} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

const group = (name: string) => screen.getByRole('region', { name })

describe('RoadmapPage', () => {
  it('shows the loading state, then five groups in the given order', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    expect(screen.getByText('Загружаем роадмап…')).toBeTruthy()
    await screen.findByRole('region', { name: 'Запланировано' })
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Запланировано', 'В разработке', 'Тестируется', 'Доработка', 'Запущено'])
  })

  it('shows a skill once with name, agent and all products of the agent, linking to the agent card', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    await screen.findByRole('region', { name: 'Запущено' })
    const links = screen.getAllByRole('link', { name: /Сводка встречи/ })
    expect(links).toHaveLength(1)
    const link = within(group('Запущено')).getByRole('link', { name: /Сводка встречи/ })
    expect(link.getAttribute('href')).toBe('/catalog/agents/a-assistant')
    expect(within(link).getByText('Ассистент')).toBeTruthy()
    expect(within(link).getByText('Control Center, Telegram-бот')).toBeTruthy()
  })

  it('opens the agent card from a skill', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: /Разбор звонка/ }))
    expect(await screen.findByText('agent card')).toBeTruthy()
  })

  it('shows an empty group', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    await screen.findByRole('region', { name: 'Доработка' })
    expect(within(group('Доработка')).getByText('Здесь пока пусто')).toBeTruthy()
    expect(within(group('Доработка')).getByText('0')).toBeTruthy()
  })

  it('filters by product without a new request', async () => {
    const { fn } = stubFetch(() => json(catalogFixture))
    renderPage()
    await screen.findByRole('region', { name: 'Запущено' })
    const calls = fn.mock.calls.length
    const filter = screen.getByRole('group', { name: 'Продукт' })
    expect(within(filter).getByRole('button', { name: 'Все продукты' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(within(filter).getByRole('button', { name: 'Telegram-бот' }))
    expect(within(filter).getByRole('button', { name: 'Telegram-бот' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('link', { name: /Разбор звонка/ })).toBeNull()
    expect(within(group('Запущено')).getByRole('link', { name: /Сводка встречи/ })).toBeTruthy()
    expect(within(group('В разработке')).getByText('Здесь пока пусто')).toBeTruthy()
    expect(fn.mock.calls.length).toBe(calls)
  })

  it('has a select filter for narrow screens that drives the same filter', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    await screen.findByRole('region', { name: 'Запущено' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Продукт' }), 'p-web')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(within(group('Запущено')).getByText('Здесь пока пусто')).toBeTruthy()
  })

  it('has no horizontal scroll container', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage()
    const board = (await screen.findByRole('region', { name: 'Запущено' })).parentElement as HTMLElement
    expect(board.className).toContain('grid-cols-1')
    expect(board.className).not.toMatch(/overflow-x/)
  })

  it('shows an error with a retry that reloads the roadmap', async () => {
    let fail = true
    const { fn } = stubFetch(() => (fail ? json({ message: 'Сбой' }, 500) : json(catalogFixture)))
    renderPage()
    await screen.findByText('Не удалось загрузить роадмап')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('region', { name: 'Запланировано' })).toBeTruthy()
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
