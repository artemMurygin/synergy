import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorMessage } from './ErrorMessage'

describe('ErrorMessage', () => {
  it('shows the title and the error text', () => {
    render(<ErrorMessage text="Агент вернул ошибку" onRetry={() => undefined} />)
    expect(screen.getByText('Не удалось получить ответ')).toBeTruthy()
    expect(screen.getByText('Агент вернул ошибку')).toBeTruthy()
  })

  it('calls onRetry when the retry action is clicked', () => {
    const onRetry = vi.fn()
    render(<ErrorMessage text="Ошибка" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('does not hint at settings for a regular error', () => {
    render(<ErrorMessage text="Ошибка" onRetry={() => undefined} />)
    expect(screen.queryByText(/настройках расширения/)).toBeNull()
  })

  it('asks to check the extension settings when the server is unreachable', () => {
    render(<ErrorMessage text="Сервер не отвечает." unreachable onRetry={() => undefined} />)
    expect(screen.getByText(/Сервер не отвечает\./)).toBeTruthy()
    expect(screen.getByText(/Проверьте адрес бэкенда в настройках расширения/)).toBeTruthy()
  })

  it('is announced as an alert', () => {
    render(<ErrorMessage text="Ошибка" onRetry={() => undefined} />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
