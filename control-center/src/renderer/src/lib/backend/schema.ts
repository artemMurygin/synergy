import type { Message } from "@ag-ui/client";
import { z } from "zod";

export const ThreadSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleIsCustom: z.boolean().default(false),
  createdAt: z.string(),
  lastActivityAt: z.string(),
  /** An agent run is in progress in this thread. */
  running: z.boolean().default(false),
});

export type Thread = z.infer<typeof ThreadSchema>;

// The server returns AG-UI messages; the runtime consumes them as is.
const MessageSchema = z.custom<Message>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { role?: unknown }).role === "string",
);

export const ThreadHistorySchema = z.object({
  /** Thread history in AG-UI message format. */
  messages: z.array(MessageSchema),
  running: z.boolean().default(false),
});

export type ThreadHistory = z.infer<typeof ThreadHistorySchema>;
