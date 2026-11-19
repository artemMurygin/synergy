import { vi } from 'vitest'
import type { TelegramLinkStatus } from '@/shared/telegram-schema'
import type { TelegramLink, TelegramLinkState } from '@/options/telegram/use-telegram-link'

export const LINKED_STATUS: TelegramLinkStatus = {
  isAvailable: true,
  isLinked: true,
  username: 'ivanov_tg',
  notificationsEnabled: true,
  linkedAt: '2026-11-11T11:20:00.000Z',
}

export function makeLink(state: TelegramLinkState, remainingMs = 0): TelegramLink {
  return {
    state,
    remainingMs,
    connect: vi.fn(() => Promise.resolve()),
    reopenLink: vi.fn(),
    cancel: vi.fn(),
    toggleNotifications: vi.fn(() => Promise.resolve()),
    unlink: vi.fn(() => Promise.resolve()),
    reload: vi.fn(),
  }
}

export function linkedState(
  patch: Partial<Extract<TelegramLinkState, { kind: 'linked' }>> = {},
): TelegramLinkState {
  return {
    kind: 'linked',
    status: LINKED_STATUS,
    isToggling: false,
    toggleError: null,
    unlinkError: null,
    ...patch,
  }
}
