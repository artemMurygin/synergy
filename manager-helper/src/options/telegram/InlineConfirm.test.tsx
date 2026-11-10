import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InlineConfirm } from './InlineConfirm'

const MESSAGE = 'Отключить Telegram @ivanov_tg? Уведомления перестанут приходить в этот чат.'

function renderConfirm(isPending = false) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <InlineConfirm
      message={MESSAGE}
      confirmLabel="Отключить"
      pendingLabel="Отключаем…"
      isPending={isPending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('InlineConfirm', () => {
  it('shows the question inside the page and confirms without a browser dialog', () => {
    const confirmDialog = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmDialog)
    const { onConfirm, onCancel } = renderConfirm()

    expect(screen.getByRole('group', { name: MESSAGE })).toBeTruthy()
    expect(screen.getByText(MESSAGE)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Отключить' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(confirmDialog).not.toHaveBeenCalled()
  })

  it('cancels without a browser dialog', () => {
    const confirmDialog = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmDialog)
    const { onConfirm, onCancel } = renderConfirm()

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(confirmDialog).not.toHaveBeenCalled()
  })

  it('disables both buttons and shows the pending label while the request runs', () => {
    const { onConfirm, onCancel } = renderConfirm(true)

    const pending = screen.getByRole('button', { name: 'Отключаем…' })
    const cancel = screen.getByRole('button', { name: 'Отмена' })
    expect(pending).toHaveProperty('disabled', true)
    expect(cancel).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: 'Отключить' })).toBeNull()

    fireEvent.click(pending)
    fireEvent.click(cancel)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
