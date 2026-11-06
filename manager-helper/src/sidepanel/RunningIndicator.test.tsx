import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RunningIndicator } from './RunningIndicator'

describe('RunningIndicator', () => {
  it('tells that the agent is still answering, without an action', () => {
    render(<RunningIndicator variant="running" />)
    expect(screen.getByText('Агент ещё отвечает')).toBeTruthy()
    expect(screen.getByText(/Панель можно закрыть/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is a polite status while running', () => {
    render(<RunningIndicator variant="running" />)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('shows the stopped variant with a retry-question action', () => {
    const onRetry = vi.fn()
    render(<RunningIndicator variant="stopped" onRetry={onRetry} />)
    expect(screen.getByText('Ответ остановлен')).toBeTruthy()
    expect(screen.getByText(/не сохранена/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить вопрос' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('omits the action of the stopped variant without a handler', () => {
    render(<RunningIndicator variant="stopped" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
