import type { ChatRole } from './chat-role';
import type { ToolCallTrace } from './tool-call-trace';

export interface ChatMessageProps {
    readonly id: number;
    readonly sessionId: string;
    readonly role: ChatRole;
    readonly text: string;
    /** Only agent messages have a tool trace. */
    readonly toolCalls: readonly ToolCallTrace[] | null;
    /** Only agent messages have a duration. */
    readonly durationMs: number | null;
    readonly createdAt: Date;
}

export class ChatMessage {
    private constructor(private readonly props: ChatMessageProps) {}

    static user(input: {
        id: number;
        sessionId: string;
        text: string;
        createdAt: Date;
    }): ChatMessage {
        return new ChatMessage({ ...input, role: 'user', toolCalls: null, durationMs: null });
    }

    static agent(input: {
        id: number;
        sessionId: string;
        text: string;
        toolCalls: readonly ToolCallTrace[];
        durationMs: number;
        createdAt: Date;
    }): ChatMessage {
        return new ChatMessage({ ...input, role: 'agent' });
    }

    static restore(props: ChatMessageProps): ChatMessage {
        if (props.role === 'user' && (props.toolCalls !== null || props.durationMs !== null)) {
            throw new Error('A user message must not have toolCalls or durationMs');
        }
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
    get text(): string {
        return this.props.text;
    }
    get toolCalls(): readonly ToolCallTrace[] | null {
        return this.props.toolCalls;
    }
    get durationMs(): number | null {
        return this.props.durationMs;
    }
    get createdAt(): Date {
        return this.props.createdAt;
    }
}
