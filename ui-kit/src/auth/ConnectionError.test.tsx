import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConnectionError } from './ConnectionError'

describe('ConnectionError', () => {
  it('offers retry and logout', async () => {
    const onRetry = vi.fn()
    const onLogout = vi.fn()
    render(<ConnectionError onRetry={onRetry} onLogout={onLogout} />)
    expect(screen.getByRole('heading', { name: 'Нет связи с сервером' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('shows "Повторяем…" and disables retry while retrying', () => {
    render(<ConnectionError onRetry={() => undefined} retrying />)
    const button = screen.getByRole('button', { name: 'Повторяем…' })
    expect(button).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull()
  })

  it('renders the footer slot', () => {
    render(<ConnectionError onRetry={() => undefined} footer={<span>Сервер: x</span>} />)
    expect(screen.getByText('Сервер: x')).toBeTruthy()
  })
})
