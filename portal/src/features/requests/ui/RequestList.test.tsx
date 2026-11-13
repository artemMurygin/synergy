import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestFixture } from '@/test/helpers'
import { RequestList } from './RequestList'

afterEach(cleanup)

const renderList = (props: Partial<React.ComponentProps<typeof RequestList>> = {}) =>
  render(
    <MemoryRouter>
      <RequestList items={[]} isLoading={false} error={null} onRetry={() => undefined} {...props} />
    </MemoryRouter>
  )

describe('RequestList', () => {
  it('shows the loading state', () => {
    renderList({ isLoading: true })
    expect(screen.getByRole('status').textContent).toMatch(/Загружаем/)
  })

  it('shows the empty state with a link to submit an idea', () => {
    renderList()
    expect(screen.getByText(/пока нет заявок/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Подать идею' }).getAttribute('href')).toBe('/ideas/new')
  })

  it('shows the error with a retry button', async () => {
    const onRetry = vi.fn()
    renderList({ error: new Error('Сервер недоступен'), onRetry })
    expect(screen.getByRole('alert').textContent).toMatch(/Сервер недоступен/)
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows title, status and date, newest first, linking to the request', () => {
    const older = { ...requestFixture, id: 'a', title: 'Старая', createdAt: '2026-11-01T09:00:00.000Z' }
    const newer = {
      ...requestFixture,
      id: 'b',
      title: 'Новая',
      status: { code: 'in_dev' as const, label: 'В разработке' },
      createdAt: '2026-11-12T09:00:00.000Z'
    }
    renderList({ items: [older, newer] })
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([expect.stringContaining('Новая'), expect.stringContaining('Старая')])
    expect(links[0]?.getAttribute('href')).toBe('/requests/b')
    expect(within(links[0] as HTMLElement).getByText('В разработке')).toBeTruthy()
    expect(within(links[0] as HTMLElement).getByText('12.11.2026')).toBeTruthy()
    expect(within(links[1] as HTMLElement).getByText('На рассмотрении')).toBeTruthy()
  })

  it('filters by status chip with counts and by title search', async () => {
    const launched = {
      ...requestFixture,
      id: 'l',
      title: 'Запущенная',
      status: { code: 'launched' as const, label: 'Запущено' },
      skill: { id: 's', name: 'Итоги встречи', description: 'd' }
    }
    renderList({ items: [requestFixture, launched] })
    expect(screen.getByRole('button', { name: 'Все · 2' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Запущено · 1' }))
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('Итоги встречи')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Все · 2' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск по заявкам' }), 'сверк')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('Ждёт решения')).toBeTruthy()
  })

  it('shows frequency, minutes and people in the meta line', () => {
    renderList({ items: [requestFixture] })
    expect(screen.getByText('5 раз в неделю · 20 мин · 3 чел.')).toBeTruthy()
    expect(screen.getByText('≈ 21 ч')).toBeTruthy()
  })
})
