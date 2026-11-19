import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider } from '../layout/layout-mode'
import { ProfileMenu } from './ProfileMenu'

function setup(props: Partial<Parameters<typeof ProfileMenu>[0]> = {}) {
  const handlers = { onTelegram: vi.fn(), onChangePassword: vi.fn(), onLogout: vi.fn() }
  render(
    <LayoutModeProvider mode="desktop">
      <ProfileMenu
        user={{ name: 'Анна Петрова', login: 'a.petrova' }}
        telegram={{ label: 'Не подключён' }}
        {...handlers}
        {...props}
      />
      <button type="button">Снаружи</button>
    </LayoutModeProvider>,
  )
  return handlers
}

const open = () => userEvent.click(screen.getByRole('button', { name: /Профиль/ }))

describe('ProfileMenu', () => {
  it('shows name, telegram status and actions when opened', async () => {
    setup()
    await open()
    expect(await screen.findByText('Анна Петрова')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Telegram/ }).textContent).toContain('Не подключён')
    expect(screen.getByRole('menuitem', { name: /Сменить пароль/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Выйти/ })).toBeTruthy()
  })

  it('hides the telegram item without telegram', async () => {
    setup({ telegram: undefined })
    await open()
    await screen.findByText('Анна Петрова')
    expect(screen.queryByRole('menuitem', { name: /Telegram/ })).toBeNull()
  })

  it('calls onTelegram and onChangePassword', async () => {
    const h = setup()
    await open()
    await userEvent.click(await screen.findByRole('menuitem', { name: /Telegram/ }))
    expect(h.onTelegram).toHaveBeenCalledOnce()
    await open()
    await userEvent.click(await screen.findByRole('menuitem', { name: /Сменить пароль/ }))
    expect(h.onChangePassword).toHaveBeenCalledOnce()
  })

  it('asks for confirmation before logging out', async () => {
    const h = setup()
    await open()
    await userEvent.click(await screen.findByRole('menuitem', { name: /Выйти/ }))
    expect(h.onLogout).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog', { name: 'Выйти из аккаунта?' })
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(h.onLogout).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(dialog.isConnected).toBe(false)

    await open()
    await userEvent.click(await screen.findByRole('menuitem', { name: /Выйти/ }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(h.onLogout).toHaveBeenCalledOnce()
  })

  it('closes on Escape and on outside click', async () => {
    setup()
    await open()
    await screen.findByRole('menu')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()

    await open()
    await screen.findByRole('menu')
    await userEvent
      .setup({ pointerEventsCheck: 0 })
      .click(screen.getByRole('button', { name: 'Снаружи', hidden: true }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
