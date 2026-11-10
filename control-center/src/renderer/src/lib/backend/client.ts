import { BackendError, RunConflictError, ThreadNotFoundError } from "./errors";

export const BACKEND_ORIGIN = "cc-api://backend";

export async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
  } catch {
    // the body is not JSON; fall back to the status line below
  }
  return `Сервер ответил ошибкой ${String(response.status)}`;
}

/** The `code` field of an error body, or null when there is none. */
export async function errorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json();
    if (typeof body === "object" && body !== null) {
      const code = (body as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
  } catch {
    // no JSON body
  }
  return null;
}

/** Calls the backend and returns the raw response; only a network failure throws. */
export async function fetchBackend(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(`${BACKEND_ORIGIN}${path}`, init);
  } catch {
    throw new BackendError("Не удалось связаться с сервером. Он запущен?");
  }
}

/** Calls the backend through the cc-api protocol and maps failures to typed errors. */
export async function request(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetchBackend(path, init);
  if (response.ok) return response;
  const message = await errorMessage(response);
  if (response.status === 404) throw new ThreadNotFoundError(message);
  if (response.status === 409) throw new RunConflictError(message);
  throw new BackendError(message);
}
