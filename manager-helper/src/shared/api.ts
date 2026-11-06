export class AskError extends Error {}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (isRecord(body) && typeof body.message === 'string') return body.message
  } catch {
    // the body is not JSON; fall back to the status line below
  }
  return `Сервер ответил ошибкой ${String(response.status)}`
}

export async function checkBackend(url: string): Promise<string> {
  try {
    const response = await fetch(`${url}/health`)
    return response.ok ? 'Сервер доступен' : `Сервер ответил ошибкой ${String(response.status)}`
  } catch {
    return 'Не удалось подключиться'
  }
}
