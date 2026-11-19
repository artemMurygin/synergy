import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TelegramConnectPanel } from './TelegramConnectPanel'

type Props = Parameters<typeof TelegramConnectPanel>[0]

function setup(props: Partial<Props> = {}) {
  const handlers = {
    onConnect: vi.fn(),
    onOpenLink: vi.fn(),
    onCancel: vi.fn(),
    onRenew: vi.fn(),
    onClose: vi.fn(),
  }
  render(<TelegramConnectPanel status="idle" botName="synergy_tasks_bot" {...handlers} {...props} />)
  return handlers
}

describe('TelegramConnectPanel', () => {
  it('idle: explains the steps and connects', async () => {
    const h = setup()
    expect(screen.getByText('Не подключён')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Подключите Telegram' })).toBeTruthy()
    expect(screen.getByText(/@synergy_tasks_bot/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Подключить' }))
    expect(h.onConnect).toHaveBeenCalledOnce()
  })

  it('requesting: shows progress and disables connect', () => {
    setup({ status: 'requesting' })
    const button = screen.getByRole('button', { name: 'Получаем ссылку…' })
    expect(button).toHaveProperty('disabled', true)
  })

  it('waiting: shows the status, timer and reopens the link via callback', async () => {
    const h = setup({ status: 'waiting', link: 'https://t.me/synergy_tasks_bot?start=abc', secondsLeft: 581 })
    expect(screen.getByText('Ждём подтверждения в Telegram')).toBeTruthy()
    expect(screen.getByText('Ссылка действует ещё 9:41')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Открыть ссылку ещё раз' }))
    expect(h.onOpenLink).toHaveBeenCalledWith('https://t.me/synergy_tasks_bot?start=abc')
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(h.onCancel).toHaveBeenCalledOnce()
  })

  it('expired: offers a new link', async () => {
    const h = setup({ status: 'expired' })
    expect(screen.getByText('Ссылка устарела')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Получить новую' }))
    expect(h.onRenew).toHaveBeenCalledOnce()
  })

  it('idle with an error: shows an alert and keeps connect available', () => {
    setup({ error: 'Нет связи с сервером. Проверьте подключение и повторите.' })
    expect(screen.getByRole('alert').textContent).toContain('Не удалось получить ссылку')
    expect(screen.getByRole('alert').textContent).toContain('Нет связи с сервером')
    expect(screen.getByRole('button', { name: 'Подключить' })).toHaveProperty('disabled', false)
  })

  it('closes via the header button', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(h.onClose).toHaveBeenCalledOnce()
  })
})
