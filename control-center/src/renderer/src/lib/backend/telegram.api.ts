import { errorCode, errorMessage, fetchBackend } from "./client";
import { BackendError, TelegramNotConfiguredError, TelegramNotLinkedError } from "./errors";
import { parseBody } from "./parse";
import {
  TelegramLinkStatusSchema,
  TelegramLinkTokenSchema,
  type TelegramLinkStatus,
  type TelegramLinkToken,
} from "./telegram.schema";

const TELEGRAM_NOT_CONFIGURED = "TELEGRAM_NOT_CONFIGURED";
const TELEGRAM_NOT_LINKED = "TELEGRAM_NOT_LINKED";
const LINK_PATH = "/telegram/link";
const LINK_TOKEN_PATH = "/telegram/link-token";

async function failure(response: Response): Promise<BackendError> {
  const message = await errorMessage(response.clone());
  const code = await errorCode(response);
  if (code === TELEGRAM_NOT_CONFIGURED) return new TelegramNotConfiguredError(message);
  if (code === TELEGRAM_NOT_LINKED) return new TelegramNotLinkedError(message);
  return new BackendError(message);
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetchBackend(path, init);
  if (response.ok) return response;
  throw await failure(response);
}

export async function getTelegramLink(): Promise<TelegramLinkStatus> {
  return parseBody(await call(LINK_PATH), TelegramLinkStatusSchema);
}

export async function issueTelegramLinkToken(): Promise<TelegramLinkToken> {
  return parseBody(await call(LINK_TOKEN_PATH, { method: "POST" }), TelegramLinkTokenSchema);
}

export async function setTelegramNotifications(isEnabled: boolean): Promise<TelegramLinkStatus> {
  const response = await call(LINK_PATH, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notificationsEnabled: isEnabled }),
  });
  return parseBody(response, TelegramLinkStatusSchema);
}

export async function unlinkTelegram(): Promise<void> {
  await call(LINK_PATH, { method: "DELETE" });
}
