import { BackendError, RunConflictError, ThreadNotFoundError } from "./errors";

export const BACKEND_ORIGIN = "cc-api://backend";

/** Tells the backend which application a chat or agent request comes from. */
export const CLIENT_APP_HEADER = "X-Client-App";
export const CLIENT_APP = "manager-app";

export async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
      return body.message;
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
    if (typeof body === "object" && body !== null && "code" in body && typeof body.code === "string") {
      return body.code;
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
