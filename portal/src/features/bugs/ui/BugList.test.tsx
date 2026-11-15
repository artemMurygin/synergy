import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bugListItemFixture } from '../model/bugs.fixtures'
import type { BugListItem } from '../model/bugs.schema'
import { BugList, type BugListProps } from './BugList'

afterEach(cleanup)

const second: BugListItem = {
  ...bugListItemFixture,
  id: 'b2',
  title: 'Протокол обрывается',
  status: 'in_progress',
  product: { id: 'p2', name: 'Telegram-бот' },
  agent: { id: 'a2', name: 'Протоколист' },
  author: { id: 'u2', login: 'petr', fullName: 'Петров Пётр' }
}

function renderList(props: Partial<BugListProps> = {}) {
  render(
    <MemoryRouter>
      <BugList items={[bugListItemFixture, second]} total={2} page={0} pageSize={20} onPageChange={vi.fn()} {...props} />
    </MemoryRouter>
  )
}

describe('BugList', () => {
  it('renders a row per bug with product, agent, status and a link to the bug', () => {
    renderList()
    const link = screen.getByRole('link', { name: /Ассистент не отвечает/ })
    expect(link.getAttribute('href')).toBe(`/bugs/${bugListItemFixture.id}`)
    expect(screen.getByText('Manager Helper · Ассистент')).toBeTruthy()
    expect(screen.getByText('Открыт')).toBeTruthy()
    expect(screen.getByText('В работе')).toBeTruthy()
  })

  it('shows the author only when showAuthor is set', () => {
    renderList()
    expect(screen.queryByText('Петров Пётр')).toBeNull()
    cleanup()
    renderList({ showAuthor: true })
    expect(screen.getByText('Петров Пётр')).toBeTruthy()
  })

  it('pages through the list', async () => {
    const onPageChange = vi.fn()
    renderList({ total: 45, onPageChange })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Вперёд' }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('shows a skeleton while loading', () => {
    renderList({ items: [], isLoading: true })
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows the error with a retry action', async () => {
    const onRetry = vi.fn()
    renderList({ items: [], error: new Error('boom'), onRetry })
    expect(screen.getByText('Не удалось загрузить обращения')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('renders the empty slot when there are no bugs', () => {
    renderList({ items: [], total: 0, empty: <p>пусто</p> })
    expect(screen.getByText('пусто')).toBeTruthy()
  })
})
