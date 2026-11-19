import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Sheet, SheetContent, SheetTrigger } from './Sheet'

function Sample({ side }: { side?: 'bottom' | 'right' }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button">Открыть</button>
      </SheetTrigger>
      <SheetContent title="Шторка" side={side}>
        <button type="button">Внутри</button>
      </SheetContent>
    </Sheet>
  )
}

describe('Sheet', () => {
  it('traps focus, closes on Escape and restores focus', async () => {
    render(<Sample />)
    const trigger = screen.getByRole('button', { name: 'Открыть' })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Шторка' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('supports the bottom side for mobile', async () => {
    render(<Sample side="bottom" />)
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('data-side')).toBe('bottom')
  })
})
