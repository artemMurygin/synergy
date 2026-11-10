import { z } from "zod";

export const NotificationTargetSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

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
