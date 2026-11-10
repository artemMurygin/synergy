import '@/features/tasks/test-dom'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TelegramLinkStatus } from '@/lib/backend/telegram.schema'
import { TelegramLinkedPanel } from './TelegramLinkedPanel'
import { linkedStatus } from './test-utils'

afterEach(cleanup)

interface SetupOptions {
  status?: TelegramLinkStatus
  isUnlinking?: boolean
  toggleErrorMessage?: string | null
  unlinkErrorMessage?: string | null
}

function renderPanel(options: SetupOptions, handlers: ReturnType<typeof createHandlers>) {
  return (
    <TelegramLinkedPanel
      status={options.status ?? linkedStatus}
      isUnlinking={options.isUnlinking ?? false}
      toggleErrorMessage={options.toggleErrorMessage ?? null}
      unlinkErrorMessage={options.unlinkErrorMessage ?? null}
      {...handlers}
    />
  )
}

function createHandlers() {
  return { onToggleNotifications: vi.fn(), onUnlink: vi.fn(), onDone: vi.fn() }
}

function setup(options: SetupOptions = {}) {
  const handlers = createHandlers()
  const view = render(renderPanel(options, handlers))
  return {
    ...handlers,
    user: userEvent.setup(),
    rerender: (next: SetupOptions) => view.rerender(renderPanel(next, handlers))
  }
}

const notificationsSwitch = () => screen.getByRole('switch', { name: 'Уведомления в Telegram', hidden: true })

describe('TelegramLinkedPanel', () => {
  it('shows the username, the link time and the linked badge', () => {
    setup()
    expect(screen.getByText('@ivanov_tg')).toBeTruthy()
    expect(screen.getByText('Подключён 11 ноября 2026, 14:20')).toBeTruthy()
    expect(screen.getByText('Подключён')).toBeTruthy()
  })

  it('shows the switch on with its hint and asks to turn it off', async () => {
    const { user, onToggleNotifications } = setup()
    expect(notificationsSwitch().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Назначения и изменения задач приходят в чат с ботом.')).toBeTruthy()
    await user.click(notificationsSwitch())
    expect(onToggleNotifications).toHaveBeenCalledWith(false)
  })

  it('shows the switch off with another hint', () => {
    setup({ status: { ...linkedStatus, notificationsEnabled: false } })
    expect(notificationsSwitch().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Сообщения в Telegram не приходят. Уведомления остаются в приложении.')).toBeTruthy()
  })

  it('reports a rejected toggle with the switch back in place', () => {
    setup({ toggleErrorMessage: 'Ошибка сервера' })
    expect(notificationsSwitch().getAttribute('aria-checked')).toBe('true')
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Не удалось изменить настройку')
  })

  it('closes on «Готово»', async () => {
    const { user, onDone } = setup()
    await user.click(screen.getByRole('button', { name: 'Готово' }))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('asks for confirmation before unlinking and unlinks on confirm', async () => {
    const { user, onUnlink } = setup()
    await user.click(screen.getByRole('button', { name: 'Отключить Telegram' }))
    expect(onUnlink).not.toHaveBeenCalled()
    const confirm = screen.getByRole('alertdialog', { name: 'Отключить Telegram?' })
    expect(confirm.textContent).toContain('Уведомления перестанут приходить в @ivanov_tg.')
    await user.click(screen.getByRole('button', { name: 'Отключить' }))
    expect(onUnlink).toHaveBeenCalledOnce()
  })

  it('does not unlink when the confirmation is cancelled', async () => {
    const { user, onUnlink } = setup()
    await user.click(screen.getByRole('button', { name: 'Отключить Telegram' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onUnlink).not.toHaveBeenCalled()
  })

  it('shows «Отключаем…» and blocks the confirmation while unlinking', async () => {
    const { user, rerender } = setup()
    await user.click(screen.getByRole('button', { name: 'Отключить Telegram' }))
    rerender({ isUnlinking: true })
    expect(screen.getByRole('button', { name: 'Отключаем…' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveProperty('disabled', true)
    expect(notificationsSwitch()).toHaveProperty('disabled', true)
  })

  it('closes the confirmation and shows the error when unlinking fails', async () => {
    const { user, rerender } = setup()
    await user.click(screen.getByRole('button', { name: 'Отключить Telegram' }))
    rerender({ isUnlinking: true })
    rerender({ unlinkErrorMessage: 'Сервер недоступен' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Не удалось отключить Telegram')
    expect(alert.textContent).toContain('Сервер недоступен')
  })
})
