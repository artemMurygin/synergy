import type { ChatRole } from './chat-role';
import type { MessageAttachment } from './message-attachment';
import type { MessageSource } from './message-source';
import { MAX_RUN_ATTACHMENTS } from './run-input';
import type { ToolCallTrace } from './tool-call-trace';

export class InvalidChatMessageError extends Error {}

export interface ChatMessageProps {
    readonly id: number;
    readonly sessionId: string;
    readonly role: ChatRole;
    readonly source: MessageSource;
    readonly text: string;
    /** Only answers to a question have a tool trace. */
    readonly toolCalls: readonly ToolCallTrace[] | null;
    /** Only answers to a question have a duration. */
    readonly durationMs: number | null;
    readonly attachments: readonly MessageAttachment[];
    /** Idempotency key of a system message; null for other messages. */
    readonly dedupKey: string | null;
    readonly createdAt: Date;
}

interface NewMessageBase {
    readonly id: number;
    readonly sessionId: string;
    readonly text: string;
    readonly createdAt: Date;
    readonly attachments?: readonly MessageAttachment[];
}

function validate(props: ChatMessageProps): ChatMessageProps {
    if (props.role === 'user') {
        if (props.toolCalls !== null || props.durationMs !== null) {
            throw new InvalidChatMessageError(
                'A user message must not have toolCalls or durationMs',
            );
        }
        if (props.source !== 'run') {
            throw new InvalidChatMessageError('A system message must come from the agent');
        }
        if (props.text.trim() === '' && props.attachments.length === 0) {
            throw new InvalidChatMessageError('A user message needs text or an attachment');
        }
        if (props.attachments.length > MAX_RUN_ATTACHMENTS) {
            throw new InvalidChatMessageError(
                `A user message has more than ${String(MAX_RUN_ATTACHMENTS)} attachments`,
            );
        }
    }
    if (props.source === 'system' && (props.toolCalls !== null || props.durationMs !== null)) {
        throw new InvalidChatMessageError('A system message has no toolCalls and no durationMs');
    }
    return {
        ...props,
        attachments: [...props.attachments].sort((a, b) => a.position - b.position),
    };
}

export class ChatMessage {
    private readonly props: ChatMessageProps;

    private constructor(props: ChatMessageProps) {
        this.props = validate(props);
    }

    static user(input: NewMessageBase): ChatMessage {
        return new ChatMessage({
            ...input,
            role: 'user',
            source: 'run',
            toolCalls: null,
            durationMs: null,
            attachments: input.attachments ?? [],
            dedupKey: null,
        });
    }

    static agent(
        input: NewMessageBase & {
            readonly toolCalls: readonly ToolCallTrace[];
            readonly durationMs: number;
        },
    ): ChatMessage {
        return new ChatMessage({
            ...input,
            role: 'agent',
            source: 'run',
            attachments: input.attachments ?? [],
            dedupKey: null,
        });
    }

    /** A message of the agent posted on a domain event, without a question of the user. */
    static system(input: NewMessageBase & { readonly dedupKey: string }): ChatMessage {
        return new ChatMessage({
            ...input,
            role: 'agent',
            source: 'system',
            toolCalls: null,
            durationMs: null,
            attachments: input.attachments ?? [],
        });
    }

    static restore(props: ChatMessageProps): ChatMessage {
        return new ChatMessage(props);
    }

    get id(): number {
        return this.props.id;
    }
    get sessionId(): string {
        return this.props.sessionId;
    }
    get role(): ChatRole {
        return this.props.role;
    }
    get source(): MessageSource {
        return this.props.source;
    }
    get text(): string {
        return this.props.text;
    }
    get toolCalls(): readonly ToolCallTrace[] | null {
        return this.props.toolCalls;
    }
    get durationMs(): number | null {
        return this.props.durationMs;
    }
    /** In the order of sending. */
    get attachments(): readonly MessageAttachment[] {
        return this.props.attachments;
    }
    get dedupKey(): string | null {
        return this.props.dedupKey;
    }
    get createdAt(): Date {
        return this.props.createdAt;
    }
}
