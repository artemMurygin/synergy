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

/** Calls the backend through the cc-api protocol and maps failures to typed errors. */
export async function request(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_ORIGIN}${path}`, init);
  } catch {
    throw new BackendError("Не удалось связаться с сервером. Он запущен?");
  }
  if (response.ok) return response;
  const message = await errorMessage(response);
  if (response.status === 404) throw new ThreadNotFoundError(message);
  if (response.status === 409) throw new RunConflictError(message);
  throw new BackendError(message);
}
