import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendError } from "./errors";
import { listUsers } from "./users.api";

const ID = "2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231";
const page = { items: [{ id: ID, login: "anna" }], total: 1, limit: 20, page: 0 };

function stubFetch(response: Response) {
  const fn = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("users.api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests /users with search, limit and page", async () => {
    const fn = stubFetch(new Response(JSON.stringify(page)));
    const result = await listUsers({ search: "an", limit: 10, page: 1 });
    const url = new URL(fn.mock.calls[0][0]);
    expect(fn.mock.calls[0][0].split("?")[0]).toBe("cc-api://backend/users");
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: "an", limit: "10", page: "1" });
    expect(result.items[0].login).toBe("anna");
  });

  it("omits an empty search", async () => {
    const fn = stubFetch(new Response(JSON.stringify(page)));
    await listUsers({});
    expect(fn.mock.calls[0][0]).toBe("cc-api://backend/users");
  });

  it("maps failures and bad bodies to BackendError", async () => {
    stubFetch(new Response(JSON.stringify({ message: "no" }), { status: 401 }));
    await expect(listUsers({})).rejects.toBeInstanceOf(BackendError);
    stubFetch(new Response(JSON.stringify({ items: [{ id: ID }] })));
    await expect(listUsers({})).rejects.toBeInstanceOf(BackendError);
  });
});
