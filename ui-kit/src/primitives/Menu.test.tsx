import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Menu, MenuContent, MenuItem, MenuTrigger } from './Menu'

describe('Menu', () => {
  it('opens by keyboard, focuses an item, selects, and restores focus', async () => {
    const onSelect = vi.fn()
    render(
      <Menu>
        <MenuTrigger asChild>
          <button type="button">Ещё</button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={onSelect}>Выйти</MenuItem>
        </MenuContent>
      </Menu>,
    )
    const trigger = screen.getByRole('button', { name: 'Ещё' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    const item = await screen.findByRole('menuitem', { name: 'Выйти' })
    expect(screen.getByRole('menu').contains(document.activeElement)).toBe(true)
    await userEvent.click(item)
    expect(onSelect).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Escape and restores focus', async () => {
    render(
      <Menu>
        <MenuTrigger asChild>
          <button type="button">Ещё</button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem>Выйти</MenuItem>
        </MenuContent>
      </Menu>,
    )
    const trigger = screen.getByRole('button', { name: 'Ещё' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menu')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
