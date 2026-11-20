import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider, type LayoutMode } from '../../layout/layout-mode'
import { ChatListItem } from './ChatListItem'

const thread = { id: 't1', title: 'Цены на МВА', lastActivityAt: new Date().toISOString() }

function setup(
  options: { active?: boolean; running?: boolean; mode?: LayoutMode; onRename?: () => unknown; onDelete?: () => unknown } = {},
) {
  const props = {
    onSelect: vi.fn(),
    onRename: vi.fn(options.onRename ?? (() => undefined)),
    onDelete: vi.fn(options.onDelete ?? (() => undefined)),
  }
  render(
    <LayoutModeProvider mode={options.mode ?? 'desktop'}>
      <ul>
        <ChatListItem thread={thread} active={options.active ?? false} running={options.running ?? false} {...props} />
      </ul>
    </LayoutModeProvider>,
  )
  return { props, user: userEvent.setup() }
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Меню чата' }))
}

describe('ChatListItem', () => {
  it('has one «…» button instead of the pencil and the trash', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Меню чата' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Переименовать' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Удалить чат' })).toBeNull()
  })

  it('shows the button on hover only for an inactive row on desktop', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Меню чата' }).className).toContain('group-hover:opacity-100')
    expect(screen.getByRole('button', { name: 'Меню чата' }).className).toContain('opacity-0')
  })

  it('always shows the button on the active chat', () => {
    setup({ active: true })
    expect(screen.getByRole('button', { name: 'Меню чата' }).className).not.toContain('opacity-0')
  })

  it('always shows the button on mobile', () => {
    setup({ mode: 'mobile' })
    expect(screen.getByRole('button', { name: 'Меню чата' }).className).not.toContain('opacity-0')
  })

  it('offers «Переименовать» and «Удалить» in the menu', async () => {
    const { user } = setup()
    await openMenu(user)
    expect(await screen.findByRole('menuitem', { name: 'Переименовать' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeTruthy()
  })

  it('renames through the menu and calls onRename with the new title', async () => {
    const { props, user } = setup()
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Переименовать' }))
    const input = screen.getByRole('textbox', { name: 'Название чата' })
    await user.clear(input)
    await user.type(input, 'Новое имя{Enter}')
    expect(props.onRename).toHaveBeenCalledWith('t1', 'Новое имя')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('asks to confirm the delete with the trash icon and deletes on «Удалить»', async () => {
    const { props, user } = setup()
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }))
    expect(screen.getByText('Удалить чат вместе с историей? Это необратимо.')).toBeTruthy()
    expect(document.querySelector('svg.lucide-trash-2')).not.toBeNull()
    expect(document.querySelector('svg.lucide-circle-alert')).toBeNull()
    expect(props.onDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(props.onDelete).toHaveBeenCalledWith('t1')
  })

  it('warns in the confirmation when the agent is answering', async () => {
    const { user } = setup({ running: true })
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }))
    expect(screen.getByText(/Агент сейчас отвечает в этом чате/)).toBeTruthy()
  })

  it('draws no red error line under the row when the delete fails', async () => {
    const { user } = setup({ onDelete: () => Promise.reject(new Error('x')) })
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }))
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(screen.queryByText('Не удалось удалить чат')).toBeNull()
    expect(screen.queryByText(/Это необратимо/)).toBeNull()
  })

  it('draws no red error line and leaves the editor when the rename fails', async () => {
    const { user } = setup({ onRename: () => Promise.reject(new Error('x')) })
    await openMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Переименовать' }))
    await user.type(screen.getByRole('textbox', { name: 'Название чата' }), '!{Enter}')
    expect(screen.queryByText('Не удалось переименовать чат')).toBeNull()
    expect(await screen.findByText('Цены на МВА')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
