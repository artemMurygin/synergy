import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { bugListItemFixture } from '@/features/bugs/model/bugs.fixtures'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { BugQueuePage } from './BugQueuePage'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
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
        <BugQueuePage />
      </MemoryRouter>
    </Wrapper>
  )
}

const page = (items: unknown[], total = items.length) => json({ items, total, limit: 20, page: 0 })
type Call = { path: string; search: string }
const queueCalls = (calls: Call[]) => calls.filter((c) => c.path === '/portal/bugs/queue')
const param = (c: Call | undefined, name: string) => new URLSearchParams(c?.search ?? '').get(name)

describe('BugQueuePage', () => {
  it('opens on "Незакрытые" without a status filter and lists bugs with the author', async () => {
    const { calls } = stubFetch(() => page([bugListItemFixture]))
    renderPage()
    expect(await screen.findByText('Ассистент не отвечает')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Баги' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Незакрытые' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Иванов Иван Иванович')).toBeTruthy()
    expect(param(queueCalls(calls)[0], 'status')).toBeNull()
  })

  it('shows a skeleton on the first load', async () => {
    stubFetch(() => new Promise<Response>(() => undefined))
    renderPage()
    expect(await screen.findByRole('status')).toBeTruthy()
  })

  it('a filter change asks the server with the status, resets the page and keeps the list instead of a skeleton', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...bugListItemFixture, id: `00000000-0000-4000-8000-0000000000${String(10 + i)}`, title: `Баг ${String(i)}` }))
    let release: (() => void) | undefined
    const { calls } = stubFetch((c) => {
      if (param(c, 'status') === 'resolved') return new Promise<Response>((r) => { release = () => r(page([], 0)) })
      return page(many, 45)
    })
    renderPage()
    await screen.findByText('Баг 0')
    await userEvent.click(screen.getByRole('button', { name: 'Вперёд' }))
    await waitFor(() => expect(queueCalls(calls).some((c) => param(c, 'page') === '1')).toBe(true))
    await userEvent.click(screen.getByRole('button', { name: 'Исправлен' }))
    await waitFor(() => expect(queueCalls(calls).some((c) => param(c, 'status') === 'resolved')).toBe(true))
    const resolved = queueCalls(calls).find((c) => param(c, 'status') === 'resolved')
    expect(Number(param(resolved, 'page') ?? 0)).toBe(0)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Исправлен' }).getAttribute('aria-pressed')).toBe('true')
    release?.()
    expect(await screen.findByText('Исправленных багов нет')).toBeTruthy()
  })

  it.each([
    ['Незакрытые', 'Незакрытых багов нет'],
    ['Открыт', 'Открытых багов нет'],
    ['В работе', 'Багов в работе нет'],
    ['Не будет исправлен', 'Закрытых без исправления багов нет']
  ])('shows an empty state with a hint for "%s"', async (label, title) => {
    stubFetch(() => page([]))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: label }))
    expect(await screen.findByText(title)).toBeTruthy()
    expect(screen.getByText(/Выберите другой статус|Новые обращения появятся здесь/)).toBeTruthy()
  })

  it('shows the error and reloads on "Повторить"', async () => {
    let fail = true
    stubFetch(() => (fail ? json({ message: 'x' }, 500) : page([bugListItemFixture])))
    renderPage()
    expect(await screen.findByText('Не удалось загрузить обращения')).toBeTruthy()
    fail = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Ассистент не отвечает')).toBeTruthy()
  })
})
