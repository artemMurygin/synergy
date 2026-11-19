import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogTrigger } from './Dialog'

function Sample() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button">Открыть</button>
      </DialogTrigger>
      <DialogContent title="Заголовок" description="Описание">
        <input aria-label="Поле" />
        <button type="button">Действие</button>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('opens, moves focus inside, closes on Escape and returns focus', async () => {
    render(<Sample />)
    const trigger = screen.getByRole('button', { name: 'Открыть' })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Заголовок' })
    expect(dialog.contains(document.activeElement)).toBe(true)

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps focus trapped inside on Tab', async () => {
    render(<Sample />)
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    const dialog = await screen.findByRole('dialog')
    for (let i = 0; i < 6; i++) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })
})
