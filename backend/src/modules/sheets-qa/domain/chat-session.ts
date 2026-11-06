import { randomUUID } from 'node:crypto';
import { ChatTitle } from './chat-title';

export interface ChatSessionProps {
    readonly id: string;
    readonly title: ChatTitle;
    readonly titleIsCustom: boolean;
    readonly createdAt: Date;
    readonly lastActivityAt: Date;
}

/** Aggregate root of a chat. Messages are stored and read through the repository. */
export class ChatSession {
    private constructor(private readonly props: ChatSessionProps) {}

    /** An explicit title is custom and is never overwritten by an auto title. */
    static create(title?: ChatTitle, now: Date = new Date()): ChatSession {
        return new ChatSession({
            id: randomUUID(),
            title: title ?? ChatTitle.default(),
            titleIsCustom: title !== undefined,
            createdAt: now,
            lastActivityAt: now,
        });
    }

    static restore(props: ChatSessionProps): ChatSession {
        return new ChatSession(props);
    }

    /** Renaming does not touch lastActivityAt. */
    rename(title: ChatTitle): ChatSession {
        return new ChatSession({ ...this.props, title, titleIsCustom: true });
    }

    /** The auto title for the first question, or undefined when the title must be kept. */
    proposeAutoTitle(question: string): ChatTitle | undefined {
        if (this.props.titleIsCustom || !this.props.title.isDefault()) return undefined;
        const title = ChatTitle.fromQuestion(question);
        return title.isDefault() ? undefined : title;
    }

    get id(): string {
        return this.props.id;
    }
    get title(): ChatTitle {
        return this.props.title;
    }
    get titleIsCustom(): boolean {
        return this.props.titleIsCustom;
    }
    get createdAt(): Date {
        return this.props.createdAt;
    }
    get lastActivityAt(): Date {
        return this.props.lastActivityAt;
    }
}
