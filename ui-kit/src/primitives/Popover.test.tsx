import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

describe('Popover', () => {
  it('moves focus inside, closes on Escape and restores focus', async () => {
    render(
      <Popover>
        <PopoverTrigger asChild>
          <button type="button">Фильтры</button>
        </PopoverTrigger>
        <PopoverContent aria-label="Фильтры">
          <button type="button">Применить</button>
        </PopoverContent>
      </Popover>,
    )
    const trigger = screen.getByRole('button', { name: 'Фильтры' })
    await userEvent.click(trigger)
    const content = await screen.findByRole('dialog', { name: 'Фильтры' })
    expect(content.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
