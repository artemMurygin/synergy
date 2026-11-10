import { z } from "zod";

const TELEGRAM_LINK_PROTOCOL = "https:";

export const TelegramLinkStatusSchema = z.object({
  isAvailable: z.boolean(),
  isLinked: z.boolean(),
  username: z.string().nullish(),
  notificationsEnabled: z.boolean().optional(),
  linkedAt: z.iso.datetime({ offset: true }).nullish(),
});
export type TelegramLinkStatus = z.infer<typeof TelegramLinkStatusSchema>;

export const TelegramLinkTokenSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type TelegramLinkToken = z.infer<typeof TelegramLinkTokenSchema>;

export function telegramBotUsernameFromUrl(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== TELEGRAM_LINK_PROTOCOL) return null;
  const [botUsername = ""] = parsed.pathname.split("/").filter((segment) => segment.length > 0);
  return botUsername.length > 0 ? botUsername : null;
}
