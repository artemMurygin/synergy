import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendError, TelegramNotConfiguredError, TelegramNotLinkedError } from "./errors";
import {
  getTelegramLink,
  issueTelegramLinkToken,
  setTelegramNotifications,
  unlinkTelegram,
} from "./telegram.api";

const linked = {
  isAvailable: true,
  isLinked: true,
  username: "ivanov_tg",
  notificationsEnabled: false,
  linkedAt: "2026-11-10T10:00:00.000Z",
};
const token = { url: "https://t.me/synergy_tasks_bot?start=abc", expiresAt: "2026-11-10T10:10:00.000Z" };

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

function stubFetch(response: Response) {
  const fn = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe("telegram.api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getTelegramLink", () => {
    it("reads the link status", async () => {
      const fn = stubFetch(json(linked));
      await expect(getTelegramLink()).resolves.toEqual(linked);
      expect(fn.mock.calls[0][0]).toBe("cc-api://backend/telegram/link");
    });

    it("rejects an unexpected body", async () => {
      stubFetch(json({ isLinked: "yes" }));
      await expect(getTelegramLink()).rejects.toBeInstanceOf(BackendError);
    });

    it("maps a server error to BackendError with its message", async () => {
      stubFetch(json({ message: "Сервис недоступен" }, 500));
      const error = await failureOf(getTelegramLink());
      expect(error).toBeInstanceOf(BackendError);
      expect(error instanceof Error && error.message).toBe("Сервис недоступен");
    });

    it("maps a network failure to BackendError", async () => {
      vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
      await expect(getTelegramLink()).rejects.toBeInstanceOf(BackendError);
    });
  });

  describe("issueTelegramLinkToken", () => {
    it("posts and returns the link with its expiry", async () => {
      const fn = stubFetch(json(token, 201));
      await expect(issueTelegramLinkToken()).resolves.toEqual(token);
      expect(fn.mock.calls[0][0]).toBe("cc-api://backend/telegram/link-token");
      expect(fn.mock.calls[0][1]?.method).toBe("POST");
    });

    it("maps 503 TELEGRAM_NOT_CONFIGURED to TelegramNotConfiguredError", async () => {
      stubFetch(json({ statusCode: 503, code: "TELEGRAM_NOT_CONFIGURED", message: "Бот не настроен" }, 503));
      const error = await failureOf(issueTelegramLinkToken());
      expect(error).toBeInstanceOf(TelegramNotConfiguredError);
      expect(error instanceof Error && error.message).toBe("Бот не настроен");
    });

    it("keeps a 503 without the code a plain BackendError", async () => {
      stubFetch(json({ message: "Шлюз недоступен" }, 503));
      const error = await failureOf(issueTelegramLinkToken());
      expect(error).toBeInstanceOf(BackendError);
      expect(error).not.toBeInstanceOf(TelegramNotConfiguredError);
    });

    it("maps 429 to BackendError with the server message", async () => {
      stubFetch(json({ code: "RATE_LIMITED", message: "Слишком много попыток" }, 429));
      const error = await failureOf(issueTelegramLinkToken());
      expect(error).toBeInstanceOf(BackendError);
      expect(error instanceof Error && error.message).toBe("Слишком много попыток");
    });
  });

  describe("setTelegramNotifications", () => {
    it("patches the flag as JSON and returns the status", async () => {
      const fn = stubFetch(json(linked));
      await expect(setTelegramNotifications(false)).resolves.toEqual(linked);
      const [url, init] = fn.mock.calls[0];
      expect(url).toBe("cc-api://backend/telegram/link");
      expect(init?.method).toBe("PATCH");
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
      expect(init?.body).toBe(JSON.stringify({ notificationsEnabled: false }));
    });

    it("maps 404 TELEGRAM_NOT_LINKED to TelegramNotLinkedError", async () => {
      stubFetch(json({ code: "TELEGRAM_NOT_LINKED", message: "Telegram не подключён" }, 404));
      await expect(setTelegramNotifications(true)).rejects.toBeInstanceOf(TelegramNotLinkedError);
    });
  });

  describe("unlinkTelegram", () => {
    it("sends DELETE and accepts an empty 204", async () => {
      const fn = stubFetch(new Response(null, { status: 204 }));
      await expect(unlinkTelegram()).resolves.toBeUndefined();
      expect(fn.mock.calls[0][0]).toBe("cc-api://backend/telegram/link");
      expect(fn.mock.calls[0][1]?.method).toBe("DELETE");
    });

    it("maps a server error to BackendError", async () => {
      stubFetch(json({ message: "Ошибка" }, 500));
      await expect(unlinkTelegram()).rejects.toBeInstanceOf(BackendError);
    });
  });
});
