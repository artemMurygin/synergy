import { describe, expect, it } from 'vitest'
import {
  botUsernameFromUrl,
  telegramLinkStatusSchema,
  telegramLinkTokenSchema,
} from './telegram-schema'

describe('telegramLinkStatusSchema', () => {
  it('parses a linked status', () => {
    const parsed = telegramLinkStatusSchema.parse({
      isAvailable: true,
      isLinked: true,
      username: 'ivanov_tg',
      notificationsEnabled: false,
      linkedAt: '2026-11-11T09:00:00.000Z',
    })
    expect(parsed).toEqual({
      isAvailable: true,
      isLinked: true,
      username: 'ivanov_tg',
      notificationsEnabled: false,
      linkedAt: '2026-11-11T09:00:00.000Z',
    })
  })

  it('fills the optional fields of an unlinked status with defaults', () => {
    expect(telegramLinkStatusSchema.parse({ isAvailable: true, isLinked: false })).toEqual({
      isAvailable: true,
      isLinked: false,
      username: null,
      notificationsEnabled: false,
      linkedAt: null,
    })
  })

  it('accepts a linked account without a username', () => {
    const parsed = telegramLinkStatusSchema.parse({
      isAvailable: true,
      isLinked: true,
      username: null,
      notificationsEnabled: true,
      linkedAt: '2026-11-11T09:00:00.000Z',
    })
    expect(parsed.username).toBeNull()
  })

  it('rejects a status without the availability flag or with a malformed date', () => {
    expect(telegramLinkStatusSchema.safeParse({ isLinked: false }).success).toBe(false)
    expect(
      telegramLinkStatusSchema.safeParse({
        isAvailable: true,
        isLinked: true,
        linkedAt: 'вчера',
      }).success,
    ).toBe(false)
  })
})

describe('telegramLinkTokenSchema', () => {
  it('parses an https link with its expiry', () => {
    const token = {
      url: 'https://t.me/synergy_bot?start=abc',
      expiresAt: '2026-11-11T09:10:00.000Z',
    }
    expect(telegramLinkTokenSchema.parse(token)).toEqual(token)
  })

  it('rejects a non-https link and a missing expiry', () => {
    expect(
      telegramLinkTokenSchema.safeParse({
        url: 'javascript:alert(1)',
        expiresAt: '2026-11-11T09:10:00.000Z',
      }).success,
    ).toBe(false)
    expect(telegramLinkTokenSchema.safeParse({ url: 'https://t.me/bot?start=a' }).success).toBe(
      false,
    )
  })
})

describe('botUsernameFromUrl', () => {
  it('takes the bot name from the link path', () => {
    expect(botUsernameFromUrl('https://t.me/synergy_bot?start=abc')).toBe('synergy_bot')
  })

  it('returns null when the link has no bot name', () => {
    expect(botUsernameFromUrl('https://t.me/')).toBeNull()
    expect(botUsernameFromUrl('не ссылка')).toBeNull()
  })
})
