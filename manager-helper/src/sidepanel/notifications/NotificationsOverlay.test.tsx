import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps, RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeNotification } from '@/background/notifications/chrome-fake.testing'
import { NotificationsOverlay } from './NotificationsOverlay'

const NOW = new Date('2026-11-10T12:00:00.000Z')
const N1 = makeNotification('n1', '2026-11-10T11:58:00.000Z', { title: 'Первое' })
const N2 = {
  ...makeNotification('n2', '2026-11-10T11:00:00.000Z', { title: 'Второе' }),
  readAt: NOW.toISOString(),
}

type Props = ComponentProps<typeof NotificationsOverlay>

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
}

function renderOverlay(overrides: Partial<Props> = {}) {
  const props: Props = {
    items: [N1, N2],
    unreadCount: 1,
    status: 'ready',
    isInitialLoad: false,
    hasMore: false,
    loadMoreStatus: 'idle',
    now: NOW,
    onOpen: vi.fn(),
    onReadAll: vi.fn(),
    onLoadMore: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<NotificationsOverlay {...props} />)
  return props
}

function overlay(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Уведомления' })
}

function readAll(): HTMLElement {
  return screen.getByRole('button', { name: 'Прочитать все' })
}

afterEach(() => {
  setWidth(1024)
})

describe('NotificationsOverlay: narrow panel', () => {
  it('lists the notifications newest first and shows the unread count', () => {
    setWidth(380)
    renderOverlay({ unreadCount: 3 })
    expect(overlay().getAttribute('data-layout')).toBe('panel')
    const rows = within(screen.getByRole('list', { name: 'Список уведомлений' })).getAllByRole(
      'button',
    )
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Первое'),
      expect.stringContaining('Второе'),
    ])
    expect(screen.getByTestId('unread-count').textContent).toBe('3 новых')
    expect(screen.getByText('2 мин')).toBeTruthy()
  })

  it('hides the unread count and disables "Прочитать все" at zero', () => {
    setWidth(380)
    renderOverlay({ unreadCount: 0 })
    expect(screen.queryByTestId('unread-count')).toBeNull()
    expect(readAll().hasAttribute('disabled')).toBe(true)
  })

  it('reads all and opens a notification', () => {
    setWidth(380)
    const props = renderOverlay()
    fireEvent.click(readAll())
    expect(props.onReadAll).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Первое/ }))
    expect(props.onOpen).toHaveBeenCalledWith(N1)
  })

  it('shows a skeleton on the first load with "Прочитать все" disabled', () => {
    setWidth(380)
    renderOverlay({ items: [], status: 'loading', isInitialLoad: true, unreadCount: 2 })
    expect(screen.getByRole('status', { name: 'Загрузка уведомлений' })).toBeTruthy()
    expect(readAll().hasAttribute('disabled')).toBe(true)
  })

  it('shows the empty state', () => {
    setWidth(380)
    renderOverlay({ items: [], unreadCount: 0 })
    expect(screen.getByText('Уведомлений пока нет')).toBeTruthy()
    expect(
      screen.getByText('Здесь появятся задачи, которые вам назначат, и другие события'),
    ).toBeTruthy()
  })

  it('shows the load error with "Повторить"', () => {
    setWidth(380)
    const props = renderOverlay({ items: [], status: 'error' })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Не удалось загрузить уведомления')).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'Повторить' }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('loads the next page', () => {
    setWidth(380)
    const props = renderOverlay({ hasMore: true })
    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }))
    expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('shows the next page loading', () => {
    setWidth(380)
    renderOverlay({ hasMore: true, loadMoreStatus: 'loading' })
    expect(screen.getByText('Загружаем ещё…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull()
  })

  it('shows the next page error with "Повторить"', () => {
    setWidth(380)
    const props = renderOverlay({ hasMore: true, loadMoreStatus: 'error' })
    expect(screen.getByText('Не удалось загрузить ещё')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('closes with the close button and with Escape', () => {
    setWidth(380)
    const props = renderOverlay()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомления' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})

describe('NotificationsOverlay: wide panel', () => {
  it('becomes a dropdown with the full time and without the close button', () => {
    setWidth(860)
    renderOverlay()
    expect(overlay().getAttribute('data-layout')).toBe('dropdown')
    expect(screen.getByText('2 мин назад')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Закрыть уведомления' })).toBeNull()
  })

  it('closes on a click outside but not on the anchor', () => {
    setWidth(860)
    const anchor = document.createElement('button')
    const outside = document.createElement('div')
    document.body.append(anchor, outside)
    const anchorRef: RefObject<HTMLElement | null> = { current: anchor }
    const props = renderOverlay({ anchorRef })
    fireEvent.mouseDown(anchor)
    expect(props.onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(within(overlay()).getByRole('button', { name: /Первое/ }))
    expect(props.onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(outside)
    expect(props.onClose).toHaveBeenCalledTimes(1)
    anchor.remove()
    outside.remove()
  })

  it('switches the layout when the panel is resized', () => {
    setWidth(380)
    renderOverlay()
    expect(overlay().getAttribute('data-layout')).toBe('panel')
    setWidth(860)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(overlay().getAttribute('data-layout')).toBe('dropdown')
  })
})
