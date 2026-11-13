import { z } from "zod";

export const NotificationTargetSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

/** Object types a notification can point at. */
export const NOTIFICATION_TARGET = { task: "task", chat: "chat", request: "request" } as const;

export const MEETING_TRANSCRIPT_READY = "meeting-transcript.ready";
export const MEETING_TRANSCRIPT_FAILED = "meeting-transcript.failed";

/** A transcript of a recording is ready or failed; the target is the chat it was sent to. */
export function isMeetingTranscriptNotification(notification: {
  type: string;
  target: { type: string };
}): boolean {
  return (
    (notification.type === MEETING_TRANSCRIPT_READY ||
      notification.type === MEETING_TRANSCRIPT_FAILED) &&
    notification.target.type === NOTIFICATION_TARGET.chat
  );
}

export const NotificationSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string(),
  body: z.string(),
  target: NotificationTargetSchema,
  actorId: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  readAt: z.iso.datetime({ offset: true }).nullable(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationPageSchema = z.object({
  items: z.array(NotificationSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  page: z.number().int().min(0),
});
export type NotificationPage = z.infer<typeof NotificationPageSchema>;

export const UnreadCountSchema = z.object({
  unreadCount: z.number().int().min(0),
});
export type UnreadCount = z.infer<typeof UnreadCountSchema>;

export const MarkReadResultSchema = UnreadCountSchema;
