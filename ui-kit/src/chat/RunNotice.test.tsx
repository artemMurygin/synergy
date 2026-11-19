import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RunNotice } from './RunNotice'

describe('RunNotice', () => {
  it('shows the title and the text with the given role', () => {
    render(<RunNotice tone="error" role="alert" title="Не удалось получить ответ" text="Сервер недоступен" />)
    expect(screen.getByRole('alert').textContent).toContain('Не удалось получить ответ')
    expect(screen.getByText('Сервер недоступен')).toBeTruthy()
  })

  it('offers the action only when both label and handler are given', async () => {
    const onAction = vi.fn()
    const { rerender } = render(
      <RunNotice tone="error" role="alert" title="t" text="x" actionLabel="Повторить" onAction={onAction} />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    rerender(<RunNotice tone="error" role="alert" title="t" text="x" actionLabel="Повторить" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('RunNotice by kind', () => {
  it('error: shows the text as an alert with "Повторить"', async () => {
    const onRetry = vi.fn()
    render(<RunNotice kind="error" text="Агент вернул ошибку" onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toContain('Агент вернул ошибку')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('stopped: says the answer is stopped, that a part is not saved, and offers a small "Повторить"', async () => {
    const onRetry = vi.fn()
    const { container } = render(<RunNotice kind="stopped" onRetry={onRetry} />)
    expect(screen.getByText('Ответ остановлен')).toBeTruthy()
    expect(screen.getByText(/не сохранена/)).toBeTruthy()
    expect(container.querySelector('svg.lucide-circle-stop')).not.toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('conflict: tells to wait or stop the agent', () => {
    render(<RunNotice kind="conflict" />)
    expect(screen.getByRole('status').textContent).toContain('Агент ещё отвечает — дождитесь ответа или остановите его')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
