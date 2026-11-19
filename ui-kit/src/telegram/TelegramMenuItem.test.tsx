import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TelegramMenuItem } from './TelegramMenuItem'

describe('TelegramMenuItem', () => {
  it('shows the label with the status and handles clicks', async () => {
    const onClick = vi.fn()
    render(<TelegramMenuItem status="Не подключён" onClick={onClick} />)
    const item = screen.getByRole('button', { name: /Telegram/ })
    expect(item.textContent).toContain('Не подключён')
    await userEvent.click(item)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
