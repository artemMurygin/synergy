import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TelegramUnlinkConfirm } from './TelegramUnlinkConfirm'

describe('TelegramUnlinkConfirm', () => {
  it('names the account and confirms or cancels', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<TelegramUnlinkConfirm username="ivanov_tg" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('heading', { name: 'Отключить Telegram?' })).toBeTruthy()
    expect(screen.getByText(/@ivanov_tg/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Отключить' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows "Отключаем…" and disables actions while pending', () => {
    render(<TelegramUnlinkConfirm username="u" pending onConfirm={() => undefined} onCancel={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Отключаем…' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveProperty('disabled', true)
  })
})
