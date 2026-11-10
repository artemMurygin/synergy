import { describe, expect, it } from "vitest";
import {
  TelegramLinkStatusSchema,
  TelegramLinkTokenSchema,
  telegramBotUsernameFromUrl,
} from "./telegram.schema";

const linked = {
  isAvailable: true,
  isLinked: true,
  username: "ivanov_tg",
  notificationsEnabled: true,
  linkedAt: "2026-11-10T10:00:00.000Z",
};

describe("telegram.schema", () => {
  describe("TelegramLinkStatusSchema", () => {
    it("parses a linked status", () => {
      expect(TelegramLinkStatusSchema.parse(linked)).toEqual(linked);
    });

    it("parses a status without a link, with only the flags", () => {
      const unlinked = { isAvailable: true, isLinked: false };
      expect(TelegramLinkStatusSchema.parse(unlinked)).toEqual(unlinked);
    });

    it("parses the unavailable bot status", () => {
      expect(TelegramLinkStatusSchema.parse({ isAvailable: false, isLinked: false }).isAvailable).toBe(false);
    });

    it("accepts a Telegram account without a username", () => {
      expect(TelegramLinkStatusSchema.parse({ ...linked, username: null }).username).toBeNull();
      const withoutUsername = { ...linked, username: undefined };
      expect(TelegramLinkStatusSchema.parse(withoutUsername).username).toBeUndefined();
    });

    it("rejects missing flags or a bad date", () => {
      expect(TelegramLinkStatusSchema.safeParse({ isLinked: false }).success).toBe(false);
      expect(TelegramLinkStatusSchema.safeParse({ isAvailable: true }).success).toBe(false);
      expect(TelegramLinkStatusSchema.safeParse({ ...linked, linkedAt: "вчера" }).success).toBe(false);
      expect(TelegramLinkStatusSchema.safeParse({ ...linked, notificationsEnabled: "yes" }).success).toBe(false);
    });
  });

  describe("TelegramLinkTokenSchema", () => {
    const token = { url: "https://t.me/synergy_tasks_bot?start=abc_DEF-123", expiresAt: "2026-11-10T10:10:00.000Z" };

    it("parses the issued link", () => {
      expect(TelegramLinkTokenSchema.parse(token)).toEqual(token);
    });

    it("rejects a non-https link, a missing url or a bad date", () => {
      expect(TelegramLinkTokenSchema.safeParse({ ...token, url: "javascript:alert(1)" }).success).toBe(false);
      expect(TelegramLinkTokenSchema.safeParse({ ...token, url: "http://t.me/bot?start=a" }).success).toBe(false);
      expect(TelegramLinkTokenSchema.safeParse({ expiresAt: token.expiresAt }).success).toBe(false);
      expect(TelegramLinkTokenSchema.safeParse({ ...token, expiresAt: "скоро" }).success).toBe(false);
    });
  });

  describe("telegramBotUsernameFromUrl", () => {
    it("takes the bot name from the t.me path", () => {
      expect(telegramBotUsernameFromUrl("https://t.me/synergy_tasks_bot?start=abc")).toBe("synergy_tasks_bot");
    });

    it("returns null when the url has no bot name", () => {
      expect(telegramBotUsernameFromUrl("https://t.me/?start=abc")).toBeNull();
      expect(telegramBotUsernameFromUrl("не ссылка")).toBeNull();
    });
  });
});
