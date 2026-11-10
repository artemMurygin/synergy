import type { z } from "zod";
import { BackendError } from "./errors";

const UNEXPECTED = "Сервер вернул ответ в неожиданном формате";

/** Reads a JSON body and validates it; any mismatch is a BackendError. */
export async function parseBody<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new BackendError(UNEXPECTED);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new BackendError(UNEXPECTED);
  return result.data;
}
