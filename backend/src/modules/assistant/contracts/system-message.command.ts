import { z } from 'zod';

/** What the system message is about; notifications pick their type by it. */
export const SYSTEM_MESSAGE_TOPICS = [
    'meeting-transcript.ready',
    'meeting-transcript.failed',
] as const;

export type SystemMessageTopic = (typeof SYSTEM_MESSAGE_TOPICS)[number];

export const systemMessageCommandSchema = z.object({
    sessionId: z.string().min(1),
    ownerId: z.string().min(1),
    text: z.string().min(1),
    /** Ids of files of the owner shown under the message, in this order. */
    attachments: z.array(z.string().min(1)),
    /** Idempotency key, usually the id of the source domain event. */
    dedupKey: z.string().min(1),
    topic: z.enum(SYSTEM_MESSAGE_TOPICS),
    /** The object of the message for notifications: never the message text. */
    subject: z.object({ fileId: z.string().min(1), fileName: z.string().min(1) }),
});

/** A message of the agent to post into a chat without a question of the user. */
export type SystemMessageCommand = z.infer<typeof systemMessageCommandSchema>;
