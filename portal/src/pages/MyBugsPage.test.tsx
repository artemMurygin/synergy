import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { bugListItemFixture } from '@/features/bugs/model/bugs.fixtures'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { MyBugsPage } from './MyBugsPage'

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
      <MemoryRouter>
        <MyBugsPage />
      </MemoryRouter>
    </Wrapper>
  )
}

const page = (items: unknown[]) => json({ items, total: items.length, limit: 20, page: 0 })

describe('MyBugsPage', () => {
  it('lists the bugs and offers to report a problem', async () => {
    stubFetch(() => page([bugListItemFixture]))
    renderPage()
    expect(await screen.findByText('Ассистент не отвечает')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Поддержка' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Сообщить о проблеме' }).getAttribute('href')).toBe('/bugs/new')
  })

  it('shows a skeleton on the first load', async () => {
    stubFetch(() => new Promise<Response>(() => undefined))
    renderPage()
    expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('shows the empty state with the report action', async () => {
    stubFetch(() => page([]))
    renderPage()
    expect(await screen.findByText('Обращений пока нет')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Сообщить о проблеме' }).getAttribute('href')).toBe('/bugs/new')
  })

  it('shows the error and reloads on "Повторить"', async () => {
    let fail = true
    const { calls } = stubFetch(() => (fail ? json({ message: 'x' }, 500) : page([bugListItemFixture])))
    renderPage()
    expect(await screen.findByText('Не удалось загрузить обращения')).toBeTruthy()
    fail = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Ассистент не отвечает')).toBeTruthy()
    expect(calls.length).toBeGreaterThan(1)
  })
})
