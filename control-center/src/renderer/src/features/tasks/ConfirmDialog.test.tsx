import './test-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

afterEach(cleanup)

function setup(extra: { pending?: boolean } = {}) {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <ConfirmDialog
      open
      title="Удалить задачу?"
      description="Задача пропадёт из списков."
      confirmLabel="Удалить"
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      {...extra}
    />
  )
  return { onConfirm, onOpenChange, user: userEvent.setup() }
}

describe('ConfirmDialog', () => {
  it('names the dialog and describes the consequence', () => {
    setup()
    const dialog = screen.getByRole('alertdialog', { name: 'Удалить задачу?' })
    const descriptionId = dialog.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(descriptionId)?.textContent).toBe('Задача пропадёт из списков.')
  })

  it('confirms', async () => {
    const { user, onConfirm } = setup()
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('closes without confirming on Cancel and Escape', async () => {
    const { user, onConfirm, onOpenChange } = setup()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('returns focus to the element that was focused when it opened', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const view = render(
      <ConfirmDialog open title="Удалить?" description="Текст" confirmLabel="Удалить" onConfirm={vi.fn()} onOpenChange={vi.fn()} />
    )
    view.rerender(
      <ConfirmDialog open={false} title="Удалить?" description="Текст" confirmLabel="Удалить" onConfirm={vi.fn()} onOpenChange={vi.fn()} />
    )
    await waitFor(() => expect(document.activeElement).toBe(opener))
    opener.remove()
  })

  it('blocks the buttons while pending', () => {
    setup({ pending: true })
    expect(screen.getByRole('button', { name: 'Удалить' })).toHaveProperty('disabled', true)
  })
})
