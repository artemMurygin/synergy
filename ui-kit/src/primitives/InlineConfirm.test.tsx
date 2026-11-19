import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InlineConfirm } from './InlineConfirm'

describe('InlineConfirm', () => {
  it('confirms and cancels via buttons', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<InlineConfirm message="Удалить?" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByText('Удалить?')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('cancels on Escape', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<InlineConfirm message="Удалить?" onConfirm={onConfirm} onCancel={onCancel} />)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
