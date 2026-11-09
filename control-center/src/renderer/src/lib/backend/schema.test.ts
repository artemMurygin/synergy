import { describe, expect, it } from "vitest";
import { ThreadHistorySchema, ThreadSchema } from "./schema";

const thread = {
  id: "t1",
  title: "Чат",
  createdAt: "2026-01-01T00:00:00Z",
  lastActivityAt: "2026-01-02T00:00:00Z",
};

describe("ThreadSchema", () => {
  it("accepts a valid thread and defaults flags to false", () => {
    const parsed = ThreadSchema.parse(thread);
    expect(parsed.titleIsCustom).toBe(false);
    expect(parsed.running).toBe(false);
  });

  it("keeps explicit flags", () => {
    const parsed = ThreadSchema.parse({
      ...thread,
      titleIsCustom: true,
      running: true,
    });
    expect(parsed.titleIsCustom).toBe(true);
    expect(parsed.running).toBe(true);
  });

  it.each(["id", "title", "lastActivityAt"])(
    "rejects a thread without %s",
    (key) => {
      const { [key]: _omitted, ...rest } = thread as Record<string, string>;
      expect(ThreadSchema.safeParse(rest).success).toBe(false);
    },
  );
});

describe("ThreadHistorySchema", () => {
  it("accepts a valid history and defaults running to false", () => {
    const parsed = ThreadHistorySchema.parse({
      messages: [{ id: "m1", role: "user", content: "привет" }],
    });
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.running).toBe(false);
  });

  it("rejects a history without messages", () => {
    expect(ThreadHistorySchema.safeParse({ running: true }).success).toBe(
      false,
    );
  });

  it("rejects a message without id or role", () => {
    expect(
      ThreadHistorySchema.safeParse({ messages: [{ role: "user" }] }).success,
    ).toBe(false);
    expect(
      ThreadHistorySchema.safeParse({ messages: [{ id: "m1" }] }).success,
    ).toBe(false);
  });
});
