import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider, type LayoutMode } from '../layout/layout-mode'
import { ChatHeader } from './ChatHeader'
import { ChatsLayout, type ChatsLayoutProps } from './ChatsLayout'
import { MobileTopBar } from '../shell/MobileTopBar'

function setup(mode: LayoutMode, props: Partial<ChatsLayoutProps> = {}) {
  return render(
    <LayoutModeProvider mode={mode}>
      <ChatsLayout list={<div>Список</div>} chat={<div>Диалог</div>} {...props} />
    </LayoutModeProvider>,
  )
}

describe('ChatsLayout', () => {
  it.each<LayoutMode>(['desktop', 'tablet'])('shows the list and the chat as two panels in %s mode', (mode) => {
    setup(mode)
    const list = screen.getByRole('complementary', { name: 'Список чатов' })
    const chat = screen.getByRole('main')
    expect(list.textContent).toBe('Список')
    expect(chat.textContent).toBe('Диалог')
    for (const panel of [list, chat]) {
      expect(panel.className).toContain('rounded-[20px]')
      expect(panel.className).toContain('shadow-panel')
    }
  })

  it('gives the whole place to the chat when the list is hidden', () => {
    setup('desktop', { listHidden: true })
    expect(screen.queryByText('Список')).toBeNull()
    expect(screen.getByText('Диалог')).toBeTruthy()
  })

  it('shows one screen in mobile mode', () => {
    const { rerender } = setup('mobile', { mobileScreen: 'list' })
    expect(screen.getByText('Список')).toBeTruthy()
    expect(screen.getByText('Диалог').closest('main')?.className).toContain('hidden')
    rerender(
      <LayoutModeProvider mode="mobile">
        <ChatsLayout list={<div>Список</div>} chat={<div>Диалог</div>} mobileScreen="chat" />
      </LayoutModeProvider>,
    )
    expect(screen.queryByText('Список')).toBeNull()
    expect(screen.getByText('Диалог')).toBeTruthy()
  })

  it('keeps the chat mounted across the mode change and a trip to the list', () => {
    let mounts = 0
    function Probe() {
      useEffect(() => {
        mounts += 1
      }, [])
      return <div>Диалог</div>
    }
    const view = (mode: LayoutMode, screen: 'list' | 'chat') => (
      <LayoutModeProvider mode={mode}>
        <ChatsLayout list={<div>Список</div>} chat={<Probe />} mobileScreen={screen} />
      </LayoutModeProvider>
    )
    const { rerender } = render(view('mobile', 'chat'))
    rerender(view('mobile', 'list'))
    rerender(view('mobile', 'chat'))
    rerender(view('tablet', 'chat'))
    rerender(view('desktop', 'chat'))
    expect(mounts).toBe(1)
  })
})

describe('ChatHeader', () => {
  it('shows the title with the time and the actions', () => {
    render(<ChatHeader title="Цены на MBA" meta="Сегодня, 14:32" actions={<button type="button">Ещё</button>} />)
    expect(screen.getByRole('heading', { name: 'Цены на MBA' })).toBeTruthy()
    expect(screen.getByText('Сегодня, 14:32')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ещё' })).toBeTruthy()
  })
})

describe('MobileTopBar', () => {
  it('shows back, title with time, create, notifications and profile', async () => {
    const onBack = vi.fn()
    const onCreate = vi.fn()
    render(
      <MobileTopBar
        title="Цены на MBA"
        meta="Сегодня, 14:32"
        onBack={onBack}
        onCreate={onCreate}
        notifications={<button type="button">Уведомления</button>}
        profile={<button type="button">Профиль</button>}
      />,
    )
    const user = userEvent.setup()
    expect(screen.getByRole('heading', { name: 'Цены на MBA' })).toBeTruthy()
    expect(screen.getByText('Сегодня, 14:32')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'К списку чатов' }))
    await user.click(screen.getByRole('button', { name: 'Новый чат' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Уведомления' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Профиль' })).toBeTruthy()
  })

  it('omits the back button without onBack', () => {
    render(<MobileTopBar title="Чаты" onCreate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'К списку чатов' })).toBeNull()
  })
})
