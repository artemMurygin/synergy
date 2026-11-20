import { LayoutModeProvider, type LayoutMode } from '@synergy/ui-kit'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps, RefObject } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { makeNotification } from '@/background/notifications/chrome-fake.testing'
import { NotificationsOverlay } from './NotificationsOverlay'

const NOW = new Date('2026-11-10T12:00:00.000Z')
const N1 = makeNotification('n1', '2026-11-10T11:58:00.000Z', { title: 'Первое' })
const N2 = {
  ...makeNotification('n2', '2026-11-10T11:00:00.000Z', { title: 'Второе' }),
  readAt: NOW.toISOString(),
}

type Props = ComponentProps<typeof NotificationsOverlay>

function renderOverlay(overrides: Partial<Props> = {}, mode: LayoutMode = 'mobile') {
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
  render(
    <LayoutModeProvider mode={mode}>
      <NotificationsOverlay {...props} />
    </LayoutModeProvider>,
  )
  return props
}

const overlay = () => screen.getByRole('dialog', { name: 'Уведомления' })
const readAll = () => screen.getByRole('button', { name: /Прочитать все/ })

describe('NotificationsOverlay: mobile', () => {
  it('lists the notifications with the unread count and short time', () => {
    renderOverlay({ unreadCount: 3 })
    expect(overlay().getAttribute('data-layout')).toBe('panel')
    expect(screen.getByRole('heading', { name: 'Уведомления' })).toBeTruthy()
    expect(screen.getByText('3 непрочитанных')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Первое/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Второе/ })).toBeTruthy()
    expect(screen.getByText('2 мин')).toBeTruthy()
  })

  it('disables "Прочитать все" at zero unread', () => {
    renderOverlay({ unreadCount: 0 })
    expect(readAll().hasAttribute('disabled')).toBe(true)
  })

  it('reads all and opens the source notification', () => {
    const props = renderOverlay()
    fireEvent.click(readAll())
    expect(props.onReadAll).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Первое/ }))
    expect(props.onOpen).toHaveBeenCalledWith(N1)
  })

  it('shows a skeleton on the first load', () => {
    renderOverlay({ items: [], status: 'loading', isInitialLoad: true })
    expect(screen.getByRole('status', { name: 'Загрузка уведомлений' })).toBeTruthy()
  })

  it('shows the empty state', () => {
    renderOverlay({ items: [], unreadCount: 0 })
    expect(screen.getByText('Уведомлений пока нет')).toBeTruthy()
  })

  it('shows the load error and retries', () => {
    const props = renderOverlay({ items: [], status: 'error' })
    expect(screen.getByText('Не удалось загрузить уведомления')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('loads the next page', () => {
    const props = renderOverlay({ hasMore: true })
    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }))
    expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('closes with the back button and with Escape', () => {
    const props = renderOverlay()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})

describe('NotificationsOverlay: mobile top bar', () => {
  it('says "Загрузка…" on the first load', () => {
    renderOverlay({ items: [], status: 'loading', isInitialLoad: true })
    expect(screen.getByText('Загрузка…')).toBeTruthy()
  })

  it('says "Нет связи с сервером" when the list failed to load', () => {
    renderOverlay({ items: [], status: 'error' })
    expect(screen.getByText('Нет связи с сервером')).toBeTruthy()
  })

  it('says "Переподключение…" and shows the banner while reconnecting, keeping the items', () => {
    renderOverlay({ connection: 'reconnecting' })
    expect(screen.getByText('Переподключение…')).toBeTruthy()
    expect(screen.getByText('Нет соединения · переподключаемся…')).toBeTruthy()
    expect(screen.getByText('Список обновится сам, когда связь восстановится')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Первое/ })).toBeTruthy()
  })

  it('has no banner when online', () => {
    renderOverlay()
    expect(screen.queryByText('Нет соединения · переподключаемся…')).toBeNull()
  })
})

describe('NotificationsOverlay: groups and icons', () => {
  const OLD = makeNotification('n3', '2026-10-01T10:00:00.000Z', { title: 'Старое' })

  it('splits the list into days', () => {
    renderOverlay({ items: [N1, OLD] }, 'tablet')
    expect(screen.getByText('Сегодня')).toBeTruthy()
    expect(screen.getByText('Ранее')).toBeTruthy()
  })

  it('draws the icon of the notification type', () => {
    renderOverlay({ items: [{ ...N1, type: 'transcript-ready' }] }, 'tablet')
    expect(document.querySelector('.lucide-audio-lines')).not.toBeNull()
  })
})

describe('NotificationsOverlay: tablet', () => {
  it('becomes a popover with the full time and without the close button', () => {
    renderOverlay({}, 'tablet')
    expect(overlay().getAttribute('data-layout')).toBe('dropdown')
    expect(screen.getByText('2 мин назад')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull()
  })

  it('closes on a click outside but not on the anchor or inside', () => {
    const anchor = document.createElement('button')
    const outside = document.createElement('div')
    document.body.append(anchor, outside)
    const anchorRef: RefObject<HTMLElement | null> = { current: anchor }
    const props = renderOverlay({ anchorRef }, 'tablet')
    fireEvent.mouseDown(anchor)
    fireEvent.mouseDown(within(overlay()).getByRole('button', { name: /Первое/ }))
    expect(props.onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(outside)
    expect(props.onClose).toHaveBeenCalledTimes(1)
    anchor.remove()
    outside.remove()
  })
})
