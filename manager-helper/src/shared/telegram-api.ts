import type { z } from 'zod'
import { errorMessage, isRecord } from './api'
import { UnauthorizedError } from './auth/auth-api'
import { authFetch } from './auth/auth-fetch'
import { getBackendUrl } from './settings'
import { telegramLinkStatusSchema, telegramLinkTokenSchema } from './telegram-schema'
import type { TelegramLinkStatus, TelegramLinkToken } from './telegram-schema'

export class TelegramApiError extends Error {}
export class TelegramNetworkError extends TelegramApiError {}
export class TelegramUnauthorizedError extends TelegramApiError {}
export class TelegramNotConfiguredError extends TelegramApiError {}
export class TelegramNotLinkedError extends TelegramApiError {}
export class TelegramRateLimitedError extends TelegramApiError {}

const UNEXPECTED_FORMAT = 'Сервер вернул ответ в неожиданном формате'
const RATE_LIMITED_MESSAGE = 'Слишком много попыток. Попробуйте через минуту.'
const SIGNED_OUT_MESSAGE = 'Вход не выполнен. Войдите в боковой панели расширения.'

async function errorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json()
    return isRecord(body) && typeof body.code === 'string' ? body.code : null
  } catch {
    return null
  }
}

async function toError(response: Response): Promise<TelegramApiError> {
  const code = await errorCode(response)
  if (response.status === 429) return new TelegramRateLimitedError(RATE_LIMITED_MESSAGE)
  const message = await errorMessage(response)
  if (response.status === 401) return new TelegramUnauthorizedError(message)
  if (code === 'TELEGRAM_NOT_CONFIGURED') return new TelegramNotConfiguredError(message)
  if (code === 'TELEGRAM_NOT_LINKED') return new TelegramNotLinkedError(message)
  return new TelegramApiError(message)
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = await getBackendUrl()
  let response: Response
  try {
    response = await authFetch(`${baseUrl}${path}`, init)
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) throw new TelegramUnauthorizedError(SIGNED_OUT_MESSAGE)
    throw new TelegramNetworkError(`Не удалось связаться с сервером ${baseUrl}. Он запущен?`)
  }
  if (!response.ok) throw await toError(response)
  return response
}

async function parseBody<TOutput>(
  response: Response,
  schema: z.ZodType<TOutput>,
): Promise<TOutput> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new TelegramApiError(UNEXPECTED_FORMAT)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new TelegramApiError(UNEXPECTED_FORMAT)
  return parsed.data
}

export async function getTelegramLink(): Promise<TelegramLinkStatus> {
  const response = await request('/telegram/link')
  return parseBody(response, telegramLinkStatusSchema)
}

export async function issueTelegramLinkToken(): Promise<TelegramLinkToken> {
  const response = await request('/telegram/link-token', { method: 'POST' })
  return parseBody(response, telegramLinkTokenSchema)
}

export async function setTelegramNotifications(
  notificationsEnabled: boolean,
): Promise<TelegramLinkStatus> {
  const response = await request('/telegram/link', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ notificationsEnabled }),
  })
  return parseBody(response, telegramLinkStatusSchema)
}

export async function unlinkTelegram(): Promise<void> {
  await request('/telegram/link', { method: 'DELETE' })
}
