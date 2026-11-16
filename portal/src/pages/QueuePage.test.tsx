import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, page, queryWrapper, requestFixture, stubFetch } from '@/test/helpers'
import { QueuePage } from './QueuePage'

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
      <MemoryRouter initialEntries={['/queue']}>
        <Routes>
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/requests/:id" element={<p>request-page</p>} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

const older = { ...requestFixture, id: 'r-old', title: 'Старая идея', author: { id: 'u2', login: 'petr', fullName: 'Петров Пётр Петрович' }, createdAt: '2026-11-01T09:00:00.000Z' }
const newer = { ...requestFixture, id: 'r-new', title: 'Новая идея', createdAt: '2026-11-10T09:00:00.000Z' }

describe('QueuePage', () => {
  it('shows title, author and submission date, oldest first', async () => {
    stubFetch(() => json(page([newer, older])))
    renderPage()
    await screen.findByText('Старая идея')
    const titles = screen.getAllByRole('link').map((l) => l.textContent ?? '')
    expect(titles.findIndex((t) => t.includes('Старая идея'))).toBeLessThan(titles.findIndex((t) => t.includes('Новая идея')))
    expect(screen.getByText('Петров Пётр Петрович')).toBeTruthy()
    expect(screen.queryByText('petr')).toBeNull()
    expect(screen.getByTitle('01.11.2026')).toBeTruthy()
    expect(screen.getAllByText(/5 раз в неделю · 20 мин · 3 чел./)).toHaveLength(2)
  })

  it('shows the subtitle of the mock-up', async () => {
    stubFetch(() => json(page([older])))
    renderPage()
    await screen.findByText('Старая идея')
    expect(screen.getByText('Новые и взятые в работу заявки, старые первыми. Возьмите заявку, оцените и примите решение')).toBeTruthy()
  })

  it('puts the "Статус" column right after "Заявка" and shows the badge of each request', async () => {
    const fresh = { ...requestFixture, id: 'r-fresh', title: 'Свежая идея', status: { code: 'new' as const, label: 'Новая' }, reviewer: null, takenAt: null }
    stubFetch(() => json(page([older, fresh])))
    renderPage()
    await screen.findByText('Старая идея')
    const heads = Array.from(document.querySelectorAll('[aria-hidden="true"] > span')).map((e) => e.textContent)
    expect(heads.slice(0, 3)).toEqual(['Заявка', 'Статус', 'Автор'])
    const fresher = screen.getByRole('link', { name: 'Свежая идея' })
    expect(within(fresher).getByText('Новая')).toBeTruthy()
    expect(within(fresher).queryByText(/·\s*с\s\d/)).toBeNull()
    const old = screen.getByRole('link', { name: 'Старая идея' })
    expect(within(old).getByText('На рассмотрении')).toBeTruthy()
  })

  it('shows who took a request under review and since when', async () => {
    stubFetch(() => json(page([older])))
    renderPage()
    await screen.findByText('Старая идея')
    expect(screen.getByText('Петров Пётр · с 11.11')).toBeTruthy()
  })

  it('opens the request on click', async () => {
    stubFetch(() => json(page([older])))
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: /Старая идея/ }))
    expect(screen.getByText('request-page')).toBeTruthy()
  })

  it('shows the empty state', async () => {
    stubFetch(() => json(page([])))
    renderPage()
    expect(await screen.findByText('Очередь пуста')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Перейти к навыкам/ }).getAttribute('href')).toBe('/skills')
  })

  it('shows an error with a retry', async () => {
    let fail = true
    stubFetch(() => (fail ? json({ message: 'Сбой' }, 500) : json(page([older]))))
    renderPage()
    const retry = await screen.findByRole('button', { name: 'Повторить' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('Старая идея')).toBeTruthy()
  })

  it('shows the full name of the author and the login when the author has no full name', async () => {
    const noName = { ...requestFixture, id: 'r-nn', title: 'Без ФИО', author: { id: 'u3', login: 'user10', fullName: 'user10' } }
    stubFetch(() => json(page([older, noName])))
    renderPage()
    await screen.findByText('Старая идея')
    expect(screen.getByText('Петров Пётр Петрович')).toBeTruthy()
    expect(screen.getByText('user10')).toBeTruthy()
  })

  it('truncates a long author name and keeps the full name in the title', async () => {
    const long = 'Константинопольская Александра Владимировна'
    stubFetch(() => json(page([{ ...older, author: { id: 'u2', login: 'kav', fullName: long } }])))
    renderPage()
    const name = await screen.findByText(long)
    expect(name.className).toContain('truncate')
    expect(name.getAttribute('title')).toBe(long)
  })
})
