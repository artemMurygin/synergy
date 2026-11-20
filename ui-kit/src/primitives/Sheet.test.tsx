import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('shows a 40x4 grabber by default on the bottom side only', async () => {
    const { unmount } = render(<Sample side="bottom" />)
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    const grabber = await screen.findByTestId('sheet-grabber')
    expect(grabber.className).toContain('w-10')
    expect(grabber.className).toContain('h-1')
    expect(grabber.className).toContain('rounded-full')
    unmount()
    render(<Sample side="right" />)
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    await screen.findByRole('dialog')
    expect(screen.queryByTestId('sheet-grabber')).toBeNull()
  })

  it('can hide the grabber', async () => {
    render(
      <Sheet>
        <SheetTrigger>Открыть</SheetTrigger>
        <SheetContent side="bottom" aria-label="Без захвата" grabber={false}>
          x
        </SheetContent>
      </Sheet>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    await screen.findByRole('dialog')
    expect(screen.queryByTestId('sheet-grabber')).toBeNull()
  })

  it('without title has no header row or close button and is named by aria-label', async () => {
    render(
      <Sheet>
        <SheetTrigger>Открыть</SheetTrigger>
        <SheetContent side="bottom" aria-label="Удалить задачу">
          <button type="button">Внутри</button>
        </SheetContent>
      </Sheet>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    expect(await screen.findByRole('dialog', { name: 'Удалить задачу' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull()
  })

  it('closes on swipe down and restores focus', async () => {
    render(<Sample side="bottom" />)
    const trigger = screen.getByRole('button', { name: 'Открыть' })
    await userEvent.click(trigger)
    const grabber = await screen.findByTestId('sheet-grabber')
    fireEvent.pointerDown(grabber, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 260, pointerId: 1 })
    fireEvent.pointerUp(grabber, { clientY: 260, pointerId: 1 })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('does not close on a short swipe', async () => {
    render(<Sample side="bottom" />)
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    const grabber = await screen.findByTestId('sheet-grabber')
    fireEvent.pointerDown(grabber, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(grabber, { clientY: 120, pointerId: 1 })
    fireEvent.pointerUp(grabber, { clientY: 120, pointerId: 1 })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
