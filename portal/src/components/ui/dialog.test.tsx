import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Dialog } from './dialog'
import { afterEach, describe, expect, it, vi } from 'vitest'

function Harness({ dismissible = true, role }: { dismissible?: boolean; role?: 'dialog' | 'alertdialog' }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Открыть</button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Новый отдел"
        description="Укажите название"
        dismissible={dismissible}
        role={role}
        footer={<button>Создать</button>}
      >
        <input aria-label="Название" />
      </Dialog>
    </div>
  )
}

afterEach(cleanup)

function describedBy(el: HTMLElement): string {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(<Dialog open={false} onClose={() => {}} title="T">x</Dialog>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a modal dialog labelled by its title and described by its description', () => {
    render(
      <Dialog open onClose={() => {}} title="Новый отдел" description="Укажите название">
        <input aria-label="Название" />
      </Dialog>
    )
    const dialog = screen.getByRole('dialog', { name: 'Новый отдел' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(describedBy(dialog)).toBe('Укажите название')
  })

  it('can be an alertdialog', () => {
    render(<Dialog open onClose={() => {}} title="Удалить?" role="alertdialog">x</Dialog>)
    expect(screen.getByRole('alertdialog', { name: 'Удалить?' }).getAttribute('aria-modal')).toBe('true')
  })

  it('moves focus to the first field on open', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByText('Открыть'))
    expect(document.activeElement).toBe(screen.getByLabelText('Название'))
  })

  it('focuses the element marked data-autofocus in preference to the first field', () => {
    render(
      <Dialog open onClose={() => {}} title="T">
        <input aria-label="Поле" />
        <button data-autofocus>Отмена</button>
      </Dialog>
    )
    expect(document.activeElement).toBe(screen.getByText('Отмена'))
  })

  it('traps focus: Tab and Shift+Tab wrap inside the dialog', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByText('Открыть'))
    // order: close button, input, footer button
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByText('Создать'))
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Закрыть' }))
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByText('Создать'))
    expect(document.activeElement).not.toBe(screen.getByText('Открыть'))
  })

  it('closes on Escape and on a click on the backdrop, then returns focus to the opener', async () => {
    render(<Harness />)
    const opener = screen.getByText('Открыть')
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)

    await userEvent.click(opener)
    await userEvent.click(screen.getByTestId('dialog-backdrop'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('does not close on a click inside the dialog', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByText('Открыть'))
    await userEvent.click(screen.getByText('Новый отдел'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('closes with the close button', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByText('Открыть'))
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ignores Escape and the backdrop and hides the close button when dismissible is false', async () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Временный пароль" dismissible={false}>
        <input aria-label="Пароль" />
      </Dialog>
    )
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByTestId('dialog-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull()
  })
})
