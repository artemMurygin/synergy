import { z } from "zod";
import { CLIENT_APP, CLIENT_APP_HEADER, request } from "./client";
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

function chatInit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set(CLIENT_APP_HEADER, CLIENT_APP);
  return { ...init, headers };
}

function chatRequest(path: string, init?: RequestInit): Promise<Response> {
  return request(path, chatInit(init));
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
  return parse(await chatRequest("/threads"), z.array(ThreadSchema));
}

export async function createThread(title?: string): Promise<Thread> {
  const init: RequestInit =
    title === undefined ? { method: "POST" } : jsonInit("POST", { title });
  return parse(await chatRequest("/threads", init), ThreadSchema);
}

export async function getThreadHistory(
  threadId: string,
): Promise<ThreadHistory> {
  return parse(
    await chatRequest(`${threadPath(threadId)}/messages`),
    ThreadHistorySchema,
  );
}

export async function renameThread(
  threadId: string,
  title: string,
): Promise<Thread> {
  return parse(
    await chatRequest(threadPath(threadId), jsonInit("PATCH", { title })),
    ThreadSchema,
  );
}

export async function deleteThread(threadId: string): Promise<void> {
  await chatRequest(threadPath(threadId), { method: "DELETE" });
}

/** Idempotent: 204 and 404 (no such run or thread) are not errors. */
export async function cancelRun(threadId: string): Promise<void> {
  try {
    await chatRequest(`${threadPath(threadId)}/run/cancel`, { method: "POST" });
  } catch (error) {
    if (error instanceof ThreadNotFoundError) return;
    throw error;
  }
}
