import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionError } from './ConnectionError'

describe('ConnectionError', () => {
  afterEach(cleanup)

  it('renders title and explanation', () => {
    render(<ConnectionError onRetry={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Нет связи с сервером' })).toBeTruthy()
    expect(
      screen.getByText('Не удалось подключиться к бэкенду. Сессия сохранена, повторите попытку.')
    ).toBeTruthy()
  })

  it('renders the title at the frame size', () => {
    render(<ConnectionError onRetry={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Нет связи с сервером' }).className).toContain('text-[22px]')
  })

  it('calls onRetry when Повторить is clicked', () => {
    const onRetry = vi.fn()
    render(<ConnectionError onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
