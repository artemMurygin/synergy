import { z } from "zod";
import { request } from "./client";
import { BackendError, ThreadNotFoundError } from "./errors";
import {
  ThreadHistorySchema,
  ThreadSchema,
  type Thread,
  type ThreadHistory,
} from "./schema";

const UNEXPECTED = "Сервер вернул ответ в неожиданном формате";

async function parse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
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

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

const threadPath = (threadId: string): string =>
  `/threads/${encodeURIComponent(threadId)}`;

export async function listThreads(): Promise<Thread[]> {
  return parse(await request("/threads"), z.array(ThreadSchema));
}

export async function createThread(title?: string): Promise<Thread> {
  const init: RequestInit =
    title === undefined ? { method: "POST" } : jsonInit("POST", { title });
  return parse(await request("/threads", init), ThreadSchema);
}

export async function getThreadHistory(
  threadId: string,
): Promise<ThreadHistory> {
  return parse(
    await request(`${threadPath(threadId)}/messages`),
    ThreadHistorySchema,
  );
}

export async function renameThread(
  threadId: string,
  title: string,
): Promise<Thread> {
  return parse(
    await request(threadPath(threadId), jsonInit("PATCH", { title })),
    ThreadSchema,
  );
}

export async function deleteThread(threadId: string): Promise<void> {
  await request(threadPath(threadId), { method: "DELETE" });
}

/** Idempotent: 204 and 404 (no such run or thread) are not errors. */
export async function cancelRun(threadId: string): Promise<void> {
  try {
    await request(`${threadPath(threadId)}/run/cancel`, { method: "POST" });
  } catch (error) {
    if (error instanceof ThreadNotFoundError) return;
    throw error;
  }
}
