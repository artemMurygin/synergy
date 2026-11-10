import { fetchBackend, errorMessage } from "./client";
import { BackendError } from "./errors";
import { parseBody } from "./parse";
import { UserPageSchema, type UserPage } from "./tasks.schema";

export interface ListUsersParams {
  search?: string;
  limit?: number;
  page?: number;
}

export async function listUsers(params: ListUsersParams): Promise<UserPage> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.page !== undefined) query.set("page", String(params.page));
  const qs = query.toString();
  const response = await fetchBackend(qs ? `/users?${qs}` : "/users");
  if (!response.ok) throw new BackendError(await errorMessage(response));
  return parseBody(response, UserPageSchema);
}
