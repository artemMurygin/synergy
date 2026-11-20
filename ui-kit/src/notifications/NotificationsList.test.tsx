import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotificationsList, type NotificationView } from './NotificationsList'

const items: NotificationView[] = [
  { id: 'a', title: 'Вам назначена задача', text: 'anna назначила вас', time: '2 мин', unread: true, group: 'Сегодня' },
  { id: 'b', title: 'Заявка принята', text: 'Заявка № 4821', time: 'вчера', unread: false, group: 'Вчера', tone: 'success' },
]

function setup(props: Partial<Parameters<typeof NotificationsList>[0]> = {}) {
  const handlers = { onOpen: vi.fn(), onReadAll: vi.fn(), onLoadMore: vi.fn(), onRetry: vi.fn() }
  render(<NotificationsList items={items} state="ready" unreadCount={1} {...handlers} {...props} />)
  return handlers
}

describe('NotificationsList', () => {
  it('renders groups and items in the ready state', () => {
    setup()
    expect(screen.getByText('Сегодня')).toBeTruthy()
    expect(screen.getByText('Вчера')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Вам назначена задача/ })).toBeTruthy()
  })

  it('shows skeletons while loading with no data', () => {
    setup({ items: [], state: 'loading' })
    expect(screen.getByRole('status', { name: 'Загрузка уведомлений' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Вам назначена/ })).toBeNull()
  })

  it('shows the empty state', () => {
    setup({ items: [], state: 'empty' })
    expect(screen.getByText('Уведомлений пока нет')).toBeTruthy()
  })

  it('shows the error state with retry', async () => {
    const h = setup({ items: [], state: 'error' })
    expect(screen.getByText('Не удалось загрузить уведомления')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(h.onRetry).toHaveBeenCalledOnce()
  })

  it('keeps data visible while refreshing', () => {
    setup({ state: 'loading' })
    expect(screen.getByRole('button', { name: /Вам назначена задача/ })).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Загрузка уведомлений' })).toBeNull()
  })

  it('keeps data visible on error and offers retry in a banner', async () => {
    const h = setup({ state: 'error' })
    expect(screen.getByRole('button', { name: /Вам назначена задача/ })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(h.onRetry).toHaveBeenCalledOnce()
  })

  it('calls onOpen with the item', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: /Заявка принята/ }))
    expect(h.onOpen).toHaveBeenCalledWith(items[1])
  })

  it('calls onReadAll and disables it without unread items', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Прочитать все' }))
    expect(h.onReadAll).toHaveBeenCalledOnce()
  })

  it('disables read-all when nothing is unread', () => {
    setup({ unreadCount: 0 })
    expect(screen.getByRole('button', { name: 'Прочитать все' })).toHaveProperty('disabled', true)
  })

  it('calls onLoadMore when more pages exist', async () => {
    const h = setup({ hasMore: true })
    await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }))
    expect(h.onLoadMore).toHaveBeenCalledOnce()
  })

  it('does not offer load more without hasMore', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull()
  })

  it('shows the reconnecting banner and keeps previous items', () => {
    setup({ connection: 'reconnecting' })
    expect(screen.getByText('Нет соединения · переподключаемся…')).toBeTruthy()
    expect(screen.getByText('Список обновится сам, когда связь восстановится')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Вам назначена задача/ })).toBeTruthy()
  })

  it('has no banner when online', () => {
    setup({ connection: 'online' })
    expect(screen.queryByText('Нет соединения · переподключаемся…')).toBeNull()
  })
})

describe('NotificationsList: hideHeader', () => {
  it('does not draw the header when the container owns it', () => {
    render(<NotificationsList items={[]} state="empty" hideHeader onOpen={() => {}} onReadAll={() => {}} onLoadMore={() => {}} onRetry={() => {}} />)
    expect(screen.queryByRole('heading', { name: 'Уведомления' })).toBeNull()
  })
})
