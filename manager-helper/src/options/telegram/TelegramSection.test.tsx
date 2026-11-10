import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '@/shared/auth'
import { useAuthSession } from '@/shared/auth'
import type { TelegramLinkStatus } from '@/shared/telegram-schema'
import { TelegramSection } from './TelegramSection'
import type { TelegramLink, TelegramLinkState } from './use-telegram-link'
import { useTelegramLink } from './use-telegram-link'

vi.mock('@/shared/auth', () => ({ useAuthSession: vi.fn() }))
vi.mock('./use-telegram-link', () => ({ useTelegramLink: vi.fn() }))

const LINKED_AT = '2026-11-11T11:20:00.000Z'
const linkedStatus: TelegramLinkStatus = {
  isAvailable: true,
  isLinked: true,
  username: 'ivanov_tg',
  notificationsEnabled: true,
  linkedAt: LINKED_AT,
}

const actions = {
  connect: vi.fn(() => Promise.resolve()),
  reopenLink: vi.fn(),
  cancel: vi.fn(),
  toggleNotifications: vi.fn<(isEnabled: boolean) => Promise<void>>(() => Promise.resolve()),
  unlink: vi.fn(() => Promise.resolve()),
  reload: vi.fn(),
}

function setLink(state: TelegramLinkState, remainingMs = 0) {
  const link: TelegramLink = { state, remainingMs, ...actions }
  vi.mocked(useTelegramLink).mockReturnValue(link)
}

function linked(patch: Partial<Extract<TelegramLinkState, { kind: 'linked' }>> = {}) {
  return {
    kind: 'linked',
    status: linkedStatus,
    isToggling: false,
    toggleError: null,
    unlinkError: null,
    ...patch,
  } satisfies TelegramLinkState
}

function section() {
  return screen.getByRole('region', { name: 'Telegram' })
}

function expectedLinkedAt(): string {
  const date = new Date(LINKED_AT)
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `Подключён ${day} ${String(date.getFullYear())}, ${time}`
}

beforeEach(() => {
  vi.clearAllMocks()
  const session: AuthSession = {
    status: 'authenticated',
    user: { id: '1', login: 'manager1' },
    notice: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    retry: vi.fn(),
  }
  vi.mocked(useAuthSession).mockReturnValue(session)
})

describe('TelegramSection', () => {
  it('passes the auth status to the hook', () => {
    setLink({ kind: 'idle' })
    render(<TelegramSection />)
    expect(useTelegramLink).toHaveBeenCalledWith('authenticated')
  })

  it('shows a skeleton while the status loads', () => {
    setLink({ kind: 'loading' })
    render(<TelegramSection />)
    expect(section().getAttribute('aria-busy')).toBe('true')
    expect(within(section()).getByText('Загружаем статус Telegram…')).toBeTruthy()
    expect(within(section()).queryByRole('button')).toBeNull()
  })

  it('is hidden when the bot is not configured on the server', () => {
    setLink({ kind: 'unavailable' })
    const { container } = render(<TelegramSection />)
    expect(container.innerHTML).toBe('')
    expect(screen.queryByText('Telegram')).toBeNull()
  })

  it('asks to sign in and offers no connect button without a session', () => {
    setLink({ kind: 'signed-out' })
    render(<TelegramSection />)
    expect(
      within(section()).getByText(
        'Чтобы подключить Telegram, войдите в боковой панели расширения.',
      ),
    ).toBeTruthy()
    expect(within(section()).queryByRole('button')).toBeNull()
  })

  it('shows the not linked state with a connect button', () => {
    setLink({ kind: 'idle' })
    render(<TelegramSection />)
    expect(within(section()).getByText('Не подключён')).toBeTruthy()
    expect(
      within(section()).getByText(/Откроется вкладка с ботом — нажмите в нём «Start»/),
    ).toBeTruthy()
    fireEvent.click(within(section()).getByRole('button', { name: 'Подключить' }))
    expect(actions.connect).toHaveBeenCalledTimes(1)
  })

  it('disables the button while the link is being issued', () => {
    setLink({ kind: 'issuing' })
    render(<TelegramSection />)
    expect(within(section()).getByRole('button', { name: 'Получаем ссылку…' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('shows the waiting state with a countdown, reopen and cancel', () => {
    setLink(
      {
        kind: 'waiting',
        url: 'https://t.me/synergy_tasks_bot?start=abc',
        botUsername: 'synergy_tasks_bot',
        expiresAt: '2026-11-11T09:10:00.000Z',
      },
      581_000,
    )
    render(<TelegramSection />)
    expect(within(section()).getByText('Ждём подтверждения в Telegram')).toBeTruthy()
    expect(
      within(section()).getByText(/Во вкладке с ботом @synergy_tasks_bot нажмите/),
    ).toBeTruthy()
    expect(within(section()).getByText('Ссылка действует ещё 9:41')).toBeTruthy()
    fireEvent.click(within(section()).getByRole('button', { name: 'Открыть ссылку ещё раз' }))
    expect(actions.reopenLink).toHaveBeenCalledTimes(1)
    fireEvent.click(within(section()).getByRole('button', { name: 'Отмена' }))
    expect(actions.cancel).toHaveBeenCalledTimes(1)
  })

  it('rounds the countdown up to whole seconds and pads them', () => {
    setLink(
      {
        kind: 'waiting',
        url: 'https://t.me/synergy_tasks_bot?start=abc',
        botUsername: null,
        expiresAt: '2026-11-11T09:10:00.000Z',
      },
      4_200,
    )
    render(<TelegramSection />)
    expect(within(section()).getByText('Ссылка действует ещё 0:05')).toBeTruthy()
    expect(within(section()).getByText(/Во вкладке с ботом нажмите/)).toBeTruthy()
  })

  it('offers a new link after the old one expired', () => {
    setLink({ kind: 'expired' })
    render(<TelegramSection />)
    expect(within(section()).getByText('Ссылка устарела')).toBeTruthy()
    fireEvent.click(within(section()).getByRole('button', { name: 'Получить новую' }))
    expect(actions.connect).toHaveBeenCalledTimes(1)
  })

  it('shows the issue error and retries', () => {
    setLink({ kind: 'error', message: 'Не удалось связаться с сервером. Он запущен?' })
    render(<TelegramSection />)
    const notice = within(section()).getByRole('alert')
    expect(within(notice).getByText('Не удалось получить ссылку')).toBeTruthy()
    expect(within(notice).getByText('Не удалось связаться с сервером. Он запущен?')).toBeTruthy()
    fireEvent.click(within(section()).getByRole('button', { name: 'Повторить' }))
    expect(actions.connect).toHaveBeenCalledTimes(1)
  })

  it('shows the not configured message without a connect button', () => {
    setLink({ kind: 'not-configured' })
    render(<TelegramSection />)
    expect(within(section()).getByText('Telegram-бот не настроен')).toBeTruthy()
    expect(within(section()).queryByRole('button')).toBeNull()
  })

  it('shows the status load error and reloads', () => {
    setLink({ kind: 'load-error', message: 'Сервер недоступен' })
    render(<TelegramSection />)
    expect(within(section()).getByText('Не удалось загрузить статус Telegram')).toBeTruthy()
    fireEvent.click(within(section()).getByRole('button', { name: 'Повторить' }))
    expect(actions.reload).toHaveBeenCalledTimes(1)
  })

  it('shows the linked account, link time and the enabled switch', () => {
    setLink(linked())
    render(<TelegramSection />)
    expect(within(section()).getByText('@ivanov_tg')).toBeTruthy()
    expect(within(section()).getByText(expectedLinkedAt())).toBeTruthy()
    expect(
      within(section()).getByText('Назначения и изменения задач приходят в чат с ботом.'),
    ).toBeTruthy()
    const toggle = within(section()).getByRole('switch', { name: 'Уведомления в Telegram' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    expect(actions.toggleNotifications).toHaveBeenCalledWith(false)
  })

  it('shows a different hint when notifications are off', () => {
    setLink(linked({ status: { ...linkedStatus, notificationsEnabled: false } }))
    render(<TelegramSection />)
    const toggle = within(section()).getByRole('switch', { name: 'Уведомления в Telegram' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(
      within(section()).getByText(
        'Сообщения в Telegram не приходят. Уведомления остаются в расширении.',
      ),
    ).toBeTruthy()
    fireEvent.click(toggle)
    expect(actions.toggleNotifications).toHaveBeenCalledWith(true)
  })

  it('locks the switch while the change is being saved', () => {
    setLink(linked({ isToggling: true }))
    render(<TelegramSection />)
    expect(
      within(section()).getByRole('switch', { name: 'Уведомления в Telegram' }),
    ).toHaveProperty('disabled', true)
  })

  it('shows the toggle error after the rollback', () => {
    setLink(linked({ toggleError: 'Ошибка сервера' }))
    render(<TelegramSection />)
    const notice = within(section()).getByRole('alert')
    expect(within(notice).getByText('Не удалось изменить настройку')).toBeTruthy()
    expect(
      within(section())
        .getByRole('switch', { name: 'Уведомления в Telegram' })
        .getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('asks for confirmation inside the page before unlinking', () => {
    const confirmDialog = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmDialog)
    setLink(linked())
    render(<TelegramSection />)

    fireEvent.click(within(section()).getByRole('button', { name: 'Отключить Telegram' }))
    const question = 'Отключить Telegram @ivanov_tg? Уведомления перестанут приходить в этот чат.'
    expect(within(section()).getByText(question)).toBeTruthy()
    expect(within(section()).queryByRole('button', { name: 'Отключить Telegram' })).toBeNull()
    expect(
      within(section()).getByRole('switch', { name: 'Уведомления в Telegram' }),
    ).toHaveProperty('disabled', true)

    fireEvent.click(within(section()).getByRole('button', { name: 'Отключить' }))
    expect(actions.unlink).toHaveBeenCalledTimes(1)
    expect(confirmDialog).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('closes the confirmation on cancel without unlinking', () => {
    setLink(linked())
    render(<TelegramSection />)
    fireEvent.click(within(section()).getByRole('button', { name: 'Отключить Telegram' }))
    fireEvent.click(within(section()).getByRole('button', { name: 'Отмена' }))
    expect(actions.unlink).not.toHaveBeenCalled()
    expect(within(section()).getByRole('button', { name: 'Отключить Telegram' })).toBeTruthy()
  })

  it('shows «Отключаем…» with locked buttons while unlinking', () => {
    setLink({ kind: 'unlinking', status: linkedStatus })
    render(<TelegramSection />)
    expect(within(section()).getByRole('button', { name: 'Отключаем…' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(within(section()).getByRole('button', { name: 'Отмена' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(within(section()).getByText('@ivanov_tg')).toBeTruthy()
  })

  it('shows the unlink error above the confirmation', () => {
    setLink(linked({ unlinkError: 'Ошибка сервера' }))
    render(<TelegramSection />)
    const notice = within(section()).getByRole('alert')
    expect(within(notice).getByText('Не удалось отключить Telegram')).toBeTruthy()
    expect(within(notice).getByText('Ошибка сервера')).toBeTruthy()
  })
})
