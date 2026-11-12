import type { Message } from "@ag-ui/client";
import { z } from "zod";
import { FileKindSchema, FileStatusSchema } from "./files.schema";

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
const AgUiMessageSchema = z.custom<Message>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { role?: unknown }).role === "string",
);

/** A file attached to a message; `status` is the current state of the stored file. */
export const MessageAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: z.string(),
  kind: FileKindSchema,
  sizeBytes: z.number(),
  status: FileStatusSchema,
});

export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;

/** `run` is an answer to a question, `system` is posted by the server on a domain event. */
export const MessageSourceSchema = z.enum(["run", "system"]);

export type MessageSource = z.infer<typeof MessageSourceSchema>;

// Older servers send neither field: no attachments, an answer to a question.
const MessageExtrasSchema = z.object({
  attachments: z.array(MessageAttachmentSchema).default([]),
  source: MessageSourceSchema.default("run"),
});

const MessageSchema = z.intersection(AgUiMessageSchema, MessageExtrasSchema);

/** An AG-UI message of the thread history with its attachments and source. */
export type HistoryMessage = z.infer<typeof MessageSchema>;

export const ThreadHistorySchema = z.object({
  /** Thread history in AG-UI message format. */
  messages: z.array(MessageSchema),
  running: z.boolean().default(false),
});

export type ThreadHistory = z.infer<typeof ThreadHistorySchema>;
