/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unused-vars -- test doubles: mocks, DOM stubs and fake transports of the test environment are typed loosely on purpose */
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

describe("ThreadHistorySchema attachments and source", () => {
  const recording = {
    id: "f1",
    name: "встреча.m4a",
    mediaType: "audio/mp4",
    kind: "recording",
    sizeBytes: 88_080_384,
    status: "active",
  };
  const transcript = {
    id: "f2",
    name: "Расшифровка — встреча.docx",
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "document",
    sizeBytes: 49_152,
    status: "deleted",
  };

  it("keeps attachments in order and the system source", () => {
    const parsed = ThreadHistorySchema.parse({
      messages: [
        { id: "m1", role: "user", content: "", attachments: [recording] },
        {
          id: "m2",
          role: "assistant",
          content: "Расшифровка готова",
          source: "system",
          attachments: [transcript, recording],
        },
      ],
    });
    expect(parsed.messages[0].attachments).toEqual([recording]);
    expect(parsed.messages[1].source).toBe("system");
    expect(parsed.messages[1].attachments.map((a) => a.id)).toEqual(["f2", "f1"]);
    expect(parsed.messages[1].attachments[0].status).toBe("deleted");
  });

  it("defaults to no attachments and the run source for old servers", () => {
    const parsed = ThreadHistorySchema.parse({
      messages: [{ id: "m1", role: "assistant", content: "ответ" }],
    });
    expect(parsed.messages[0].attachments).toEqual([]);
    expect(parsed.messages[0].source).toBe("run");
  });

  it("keeps the other AG-UI fields of a message", () => {
    const toolCalls = [
      { id: "c1", type: "function", function: { name: "t", arguments: "{}" } },
    ];
    const parsed = ThreadHistorySchema.parse({
      messages: [{ id: "m1", role: "assistant", content: "x", toolCalls }],
    });
    expect((parsed.messages[0] as { toolCalls?: unknown }).toolCalls).toEqual(
      toolCalls,
    );
  });

  it.each([
    ["an unknown source", { source: "cron" }],
    ["an unknown file status", { attachments: [{ ...recording, status: "lost" }] }],
    ["an unknown file kind", { attachments: [{ ...recording, kind: "image" }] }],
    ["an attachment without id", { attachments: [{ ...recording, id: undefined }] }],
  ])("rejects %s", (_label, extra) => {
    expect(
      ThreadHistorySchema.safeParse({
        messages: [{ id: "m1", role: "assistant", content: "x", ...extra }],
      }).success,
    ).toBe(false);
  });
});
