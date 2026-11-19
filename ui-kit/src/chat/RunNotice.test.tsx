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
