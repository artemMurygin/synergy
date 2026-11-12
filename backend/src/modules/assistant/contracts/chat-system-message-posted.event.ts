import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';
import { SYSTEM_MESSAGE_TOPICS, type SystemMessageTopic } from './system-message.command';

export const CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE = 'chat.system-message-posted';

/** Without the message text: notifications build their own title from the topic and subject. */
export const chatSystemMessagePostedPayloadSchema = z.object({
    ownerId: z.string().min(1),
    messageId: z.number().int().positive(),
    topic: z.enum(SYSTEM_MESSAGE_TOPICS),
    subject: z.object({ fileId: z.string().min(1), fileName: z.string().min(1) }),
});

export type ChatSystemMessagePostedPayload = z.infer<typeof chatSystemMessagePostedPayloadSchema>;

/** A system message was added to a chat; the aggregate is the chat session. */
export class ChatSystemMessagePostedEvent extends DomainEvent {
    readonly ownerId: string;

    readonly messageId: number;

    readonly topic: SystemMessageTopic;

    readonly subject: ChatSystemMessagePostedPayload['subject'];

    constructor(props: DomainEventProps<ChatSystemMessagePostedPayload>) {
        super(props);
        this.ownerId = props.ownerId;
        this.messageId = props.messageId;
        this.topic = props.topic;
        this.subject = props.subject;
    }

    get sessionId(): string {
        return this.aggregateId;
    }
}
