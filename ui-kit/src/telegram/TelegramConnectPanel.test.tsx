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

describe('TelegramConnectPanel without a bot name', () => {
  it('does not print an empty mention', () => {
    render(<TelegramConnectPanel status="idle" onConnect={() => undefined} onOpenLink={() => undefined} onCancel={() => undefined} onRenew={() => undefined} />)
    expect(screen.getByText(/чат с ботом\. Откроется/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('@')
  })

  describe('QR и ссылка', () => {
    const link = 'https://t.me/synergy_tasks_bot?start=abc123'

    it('waiting: shows QR from link, caption and link chip', async () => {
      setup({ status: 'waiting', link, secondsLeft: 540 })
      const qr = await screen.findByRole('img', { name: 'QR-код ссылки на бота' })
      expect(qr.querySelector('svg')).toBeTruthy()
      expect(screen.getByText('Удобнее с телефона?')).toBeTruthy()
      expect(screen.getByText(/Отсканируйте код камерой/)).toBeTruthy()
      expect(screen.getByText(/t\.me\/synergy_tasks_bot\?start=abc123/)).toBeTruthy()
    })

    it('copy puts the link into the clipboard and confirms briefly', async () => {
      const user = userEvent.setup()
      const onCopy = vi.fn()
      setup({ status: 'waiting', link, onCopy })
      await user.click(screen.getByRole('button', { name: 'Копировать ссылку' }))
      expect(await navigator.clipboard.readText()).toBe(link)
      expect(onCopy).toHaveBeenCalledWith(link)
      expect(screen.getByRole('button', { name: 'Ссылка скопирована' })).toBeTruthy()
    })

    it('waiting without link: no QR and no chip', () => {
      setup({ status: 'waiting' })
      expect(screen.queryByRole('img', { name: 'QR-код ссылки на бота' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Копировать ссылку' })).toBeNull()
    })

    it('expired: QR and chip are hidden even with a stale link', () => {
      setup({ status: 'expired', link })
      expect(screen.queryByRole('img', { name: 'QR-код ссылки на бота' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Копировать ссылку' })).toBeNull()
      expect(screen.getByText('Ссылка устарела')).toBeTruthy()
    })
  })
})
