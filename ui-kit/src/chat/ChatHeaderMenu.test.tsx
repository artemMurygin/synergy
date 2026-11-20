import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatHeaderMenu } from './ChatHeaderMenu'

function setup(disabled = false) {
  const onRename = vi.fn()
  const onDelete = vi.fn()
  render(<ChatHeaderMenu onRename={onRename} onDelete={onDelete} disabled={disabled} />)
  return { onRename, onDelete, user: userEvent.setup() }
}

describe('ChatHeaderMenu', () => {
  it('opens a menu with "Переименовать" and "Удалить"', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Меню чата' }))
    expect(screen.getByRole('menuitem', { name: 'Переименовать' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeTruthy()
  })

  it('calls onRename and onDelete', async () => {
    const { user, onRename, onDelete } = setup()
    await user.click(screen.getByRole('button', { name: 'Меню чата' }))
    await user.click(screen.getByRole('menuitem', { name: 'Переименовать' }))
    expect(onRename).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Меню чата' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('is not available for an empty chat', async () => {
    const { user } = setup(true)
    const trigger = screen.getByRole('button', { name: 'Меню чата' })
    expect(trigger.hasAttribute('disabled')).toBe(true)
    await user.click(trigger)
    expect(screen.queryByRole('menuitem')).toBeNull()
  })
})
