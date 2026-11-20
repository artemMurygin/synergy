import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider, type LayoutMode } from '../layout/layout-mode'
import { ChatHeader } from './ChatHeader'

function setup(mode: LayoutMode, extra: Partial<React.ComponentProps<typeof ChatHeader>> = {}) {
  const handlers = { onSearch: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() }
  render(
    <LayoutModeProvider mode={mode}>
      <ChatHeader title="Цены на MBA" meta="Сегодня, 14:32" {...handlers} {...extra} />
    </LayoutModeProvider>,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('ChatHeader', () => {
  it.each(['desktop', 'tablet'] as const)('has the search and the menu buttons on %s', async (mode) => {
    const { user, onSearch } = setup(mode)
    await user.click(screen.getByRole('button', { name: 'Поиск по чату' }))
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Меню чата' })).toBeTruthy()
  })

  it('has neither the search nor the menu on mobile', () => {
    setup('mobile')
    expect(screen.queryByRole('button', { name: 'Поиск по чату' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Меню чата' })).toBeNull()
  })

  it('has no menu for an empty chat', () => {
    setup('desktop', { emptyChat: true })
    expect(screen.getByRole('button', { name: 'Меню чата' }).hasAttribute('disabled')).toBe(true)
  })

  it('has no capsule of actions without handlers', () => {
    render(<ChatHeader title="Чат" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps extra actions of the app', () => {
    setup('desktop', { actions: <button type="button">Новый чат</button> })
    expect(screen.getByRole('button', { name: 'Новый чат' })).toBeTruthy()
  })
})
