import { z } from 'zod'

const isoDateTime = z.iso.datetime({ offset: true })

export const telegramLinkStatusSchema = z
  .object({
    isAvailable: z.boolean(),
    isLinked: z.boolean(),
    username: z.string().nullish(),
    notificationsEnabled: z.boolean().optional(),
    linkedAt: isoDateTime.nullish(),
  })
  .transform((status) => ({
    isAvailable: status.isAvailable,
    isLinked: status.isLinked,
    username: status.username ?? null,
    notificationsEnabled: status.notificationsEnabled ?? false,
    linkedAt: status.linkedAt ?? null,
  }))

export const telegramLinkTokenSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
  expiresAt: isoDateTime,
})

export type TelegramLinkStatus = z.output<typeof telegramLinkStatusSchema>
export type TelegramLinkToken = z.output<typeof telegramLinkTokenSchema>

export function botUsernameFromUrl(url: string): string | null {
  if (!URL.canParse(url)) return null
  const [botUsername] = new URL(url).pathname.split('/').filter((segment) => segment !== '')
  return botUsername ?? null
}
