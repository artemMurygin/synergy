/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unnecessary-condition -- test doubles: mocks, DOM stubs and fake transports of the test environment are typed loosely on purpose */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendError } from '@/lib/backend/errors'
import * as notificationsApi from '@/lib/backend/notifications.api'
import { NOTIFICATIONS_PAGE_SIZE } from '@/lib/backend/notifications.queries'
import type { Notification, NotificationPage } from '@/lib/backend/notifications.schema'
import { NotificationsPopover } from './NotificationsPopover'
import { createTestQueryClient, createWrapper, makeNotification } from './test-utils'

vi.mock('@/lib/backend/notifications.api')

afterEach(cleanup)

const page = (items: Notification[], pageIndex = 0, total = items.length): NotificationPage => ({
  items,
  total,
  limit: NOTIFICATIONS_PAGE_SIZE,
  page: pageIndex
})

const many = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => makeNotification(String(from + index), '2026-11-10T10:00:00.000Z'))

function mount(onOpenNotification: (notification: Notification) => void = () => {}) {
  const client = createTestQueryClient()
  render(<NotificationsPopover onOpenNotification={onOpenNotification} />, { wrapper: createWrapper(client) })
  return userEvent.setup()
}

const readAllButton = () => screen.getByRole('button', { name: 'Прочитать все' })
const rows = () => screen.getAllByRole('button', { name: /^Уведомление \d+/ })
const scroller = () => screen.getByText('Уведомление 1').closest('[aria-busy]') as HTMLElement

beforeEach(() => {
  vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 0 })
})

describe('NotificationsPopover', () => {
  it('lists notifications in the order of the server and marks unread ones', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(
      page([makeNotification('1'), makeNotification('2'), makeNotification('3', '2026-11-10T10:05:00.000Z')])
    )
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 2 })
    mount()
    await screen.findByText('Уведомление 1')
    expect(rows().map((row) => row.textContent?.match(/Уведомление \d/)?.[0])).toEqual([
      'Уведомление 1',
      'Уведомление 2',
      'Уведомление 3'
    ])
    expect(rows().map((row) => row.querySelector('[aria-label="Непрочитано"]') !== null)).toEqual([true, true, false])
    expect(await screen.findByRole('heading', { name: /Уведомления\s*2/ })).toBeTruthy()
  })

  it('disables «Прочитать все» with no unread', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(page(many(1, 2)))
    mount()
    await screen.findByText('Уведомление 1')
    expect(readAllButton().hasAttribute('disabled')).toBe(true)
  })

  it('marks everything read through «Прочитать все»', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(page([makeNotification('1')]))
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 1 })
    vi.mocked(notificationsApi.markAllNotificationsRead).mockResolvedValue({ unreadCount: 0 })
    const user = mount()
    await screen.findByText('Уведомление 1')
    await waitFor(() => { expect(readAllButton().hasAttribute('disabled')).toBe(false); })
    await user.click(readAllButton())
    expect(notificationsApi.markAllNotificationsRead).toHaveBeenCalledTimes(1)
    await waitFor(() => { expect(readAllButton().hasAttribute('disabled')).toBe(true); })
    expect(screen.queryByLabelText('Непрочитано')).toBeNull()
  })

  it('shows a skeleton while loading with «Прочитать все» disabled', () => {
    vi.mocked(notificationsApi.listNotifications).mockReturnValue(new Promise(() => {}))
    vi.mocked(notificationsApi.getUnreadCount).mockReturnValue(new Promise(() => {}))
    mount()
    expect(screen.getByRole('status', { name: 'Загрузка уведомлений' })).toBeTruthy()
    expect(readAllButton().hasAttribute('disabled')).toBe(true)
  })

  it('shows the empty state', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(page([]))
    mount()
    expect(await screen.findByText('Уведомлений пока нет')).toBeTruthy()
  })

  it('shows the load error and retries', async () => {
    vi.mocked(notificationsApi.listNotifications)
      .mockRejectedValueOnce(new BackendError('down'))
      .mockResolvedValueOnce(page([makeNotification('1')]))
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 2 })
    const user = mount()
    expect(await screen.findByText('Не удалось загрузить уведомления')).toBeTruthy()
    expect(readAllButton().hasAttribute('disabled')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Уведомление 1')).toBeTruthy()
    expect(notificationsApi.listNotifications).toHaveBeenCalledTimes(2)
  })

  it('loads the next page on scroll', async () => {
    vi.mocked(notificationsApi.listNotifications)
      .mockResolvedValueOnce(page(many(1, NOTIFICATIONS_PAGE_SIZE), 0, 25))
      .mockResolvedValueOnce(page(many(21, 5), 1, 25))
    mount()
    await screen.findByText('Уведомление 1')
    fireEvent.scroll(scroller())
    expect(await screen.findByText('Уведомление 25')).toBeTruthy()
    expect(notificationsApi.listNotifications).toHaveBeenLastCalledWith({ page: 1, limit: NOTIFICATIONS_PAGE_SIZE })
  })

  it('loads the next page with «Показать ещё»', async () => {
    vi.mocked(notificationsApi.listNotifications)
      .mockResolvedValueOnce(page(many(1, NOTIFICATIONS_PAGE_SIZE), 0, 25))
      .mockResolvedValueOnce(page(many(21, 5), 1, 25))
    const user = mount()
    await user.click(await screen.findByRole('button', { name: 'Показать ещё' }))
    expect(await screen.findByText('Уведомление 25')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull()
  })

  it('shows the next page error with «Повторить» and keeps the loaded list', async () => {
    vi.mocked(notificationsApi.listNotifications)
      .mockResolvedValueOnce(page(many(1, NOTIFICATIONS_PAGE_SIZE), 0, 25))
      .mockRejectedValueOnce(new BackendError('down'))
      .mockResolvedValueOnce(page(many(21, 5), 1, 25))
    const user = mount()
    await screen.findByText('Уведомление 1')
    fireEvent.scroll(scroller())
    expect(await screen.findByText('Не удалось обновить уведомления')).toBeTruthy()
    expect(screen.getByText('Уведомление 1')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Уведомление 25')).toBeTruthy()
  })

  it('does not request another page when everything is loaded', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(page(many(1, 3)))
    mount()
    await screen.findByText('Уведомление 1')
    fireEvent.scroll(scroller())
    expect(notificationsApi.listNotifications).toHaveBeenCalledTimes(1)
  })

  it('passes a clicked notification to onOpenNotification', async () => {
    const notification = makeNotification('1')
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(page([notification]))
    const onOpen = vi.fn()
    const user = mount(onOpen)
    await user.click(await screen.findByRole('button', { name: /Уведомление 1/ }))
    expect(onOpen).toHaveBeenCalledWith(notification)
  })
})
