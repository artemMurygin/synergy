import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
const list = () => screen.getByRole('list', { name: 'Уведомления' })

beforeEach(() => {
  vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 0 })
})

describe('NotificationsPopover', () => {
  it('lists notifications newest first and highlights unread ones', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(
      page([makeNotification('1'), makeNotification('2'), makeNotification('3', '2026-11-10T10:05:00.000Z')])
    )
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 2 })
    mount()
    const rows = await within(await screen.findByRole('list', { name: 'Уведомления' })).findAllByRole('button')
    expect(rows.map((row) => row.querySelector('[data-slot="title"]')?.textContent)).toEqual([
      'Уведомление 1',
      'Уведомление 2',
      'Уведомление 3'
    ])
    expect(rows.map((row) => row.getAttribute('data-unread'))).toEqual(['true', 'true', 'false'])
    expect(await screen.findByText('2 новых')).toBeTruthy()
  })

  it('hides the new count and disables «Прочитать все» with no unread', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(page(many(1, 2)))
    mount()
    await screen.findByText('Уведомление 1')
    expect(screen.queryByText(/новых/)).toBeNull()
    expect(readAllButton().hasAttribute('disabled')).toBe(true)
  })

  it('marks everything read through «Прочитать все»', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(page([makeNotification('1')]))
    vi.mocked(notificationsApi.getUnreadCount).mockResolvedValue({ unreadCount: 1 })
    vi.mocked(notificationsApi.markAllNotificationsRead).mockResolvedValue({ unreadCount: 0 })
    const user = mount()
    await screen.findByText('1 новых')
    await waitFor(() => expect(readAllButton().hasAttribute('disabled')).toBe(false))
    await user.click(readAllButton())
    expect(notificationsApi.markAllNotificationsRead).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText(/новых/)).toBeNull())
    expect(within(list()).getByRole('button').getAttribute('data-unread')).toBe('false')
    expect(readAllButton().hasAttribute('disabled')).toBe(true)
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
    await waitFor(() => expect(notificationsApi.getUnreadCount).toHaveBeenCalled())
    expect(screen.queryByText(/новых/)).toBeNull()
    expect(readAllButton().hasAttribute('disabled')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Уведомление 1')).toBeTruthy()
    expect(notificationsApi.listNotifications).toHaveBeenCalledTimes(2)
  })

  it('loads the next page on scroll and shows «Загружаем ещё…» meanwhile', async () => {
    let resolveNext: (value: NotificationPage) => void = () => {}
    vi.mocked(notificationsApi.listNotifications)
      .mockResolvedValueOnce(page(many(1, NOTIFICATIONS_PAGE_SIZE), 0, 25))
      .mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)))
    mount()
    await screen.findByText('Уведомление 1')
    fireEvent.scroll(list())
    expect(await screen.findByText('Загружаем ещё…')).toBeTruthy()
    expect(notificationsApi.listNotifications).toHaveBeenLastCalledWith({ page: 1, limit: NOTIFICATIONS_PAGE_SIZE })
    resolveNext(page(many(21, 5), 1, 25))
    expect(await screen.findByText('Уведомление 25')).toBeTruthy()
    expect(screen.queryByText('Загружаем ещё…')).toBeNull()
  })

  it('shows the next page error with «Повторить» and keeps the loaded list', async () => {
    vi.mocked(notificationsApi.listNotifications)
      .mockResolvedValueOnce(page(many(1, NOTIFICATIONS_PAGE_SIZE), 0, 25))
      .mockRejectedValueOnce(new BackendError('down'))
      .mockResolvedValueOnce(page(many(21, 5), 1, 25))
    const user = mount()
    await screen.findByText('Уведомление 1')
    fireEvent.scroll(list())
    expect(await screen.findByText('Не удалось загрузить ещё')).toBeTruthy()
    expect(screen.getByText('Уведомление 1')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByText('Уведомление 25')).toBeTruthy()
  })

  it('does not request another page when everything is loaded', async () => {
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue(page(many(1, 3)))
    mount()
    await screen.findByText('Уведомление 1')
    fireEvent.scroll(list())
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
