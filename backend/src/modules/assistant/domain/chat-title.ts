export const MAX_CHAT_TITLE_LENGTH = 120;
export const DEFAULT_CHAT_TITLE = 'Новый чат';
const AUTO_TITLE_LENGTH = 60;

export class InvalidChatTitleError extends Error {}

/** Chat title: trimmed, 1-120 characters. */
export class ChatTitle {
    private constructor(readonly value: string) {}

    static of(raw: string): ChatTitle {
        const value = raw.trim();
        if (value.length === 0) throw new InvalidChatTitleError('Chat title must not be empty');
        if (value.length > MAX_CHAT_TITLE_LENGTH) {
            throw new InvalidChatTitleError(
                `Chat title is longer than ${String(MAX_CHAT_TITLE_LENGTH)} characters`,
            );
        }
        return new ChatTitle(value);
    }

    static default(): ChatTitle {
        return new ChatTitle(DEFAULT_CHAT_TITLE);
    }

    /** Auto title from the first question: whitespace collapsed, cut to ~60 characters. */
    static fromQuestion(question: string): ChatTitle {
        const text = question.replace(/\s+/g, ' ').trim();
        if (text.length === 0) return ChatTitle.default();
        if (text.length <= AUTO_TITLE_LENGTH) return new ChatTitle(text);
        return new ChatTitle(`${text.slice(0, AUTO_TITLE_LENGTH).trimEnd()}…`);
    }

    isDefault(): boolean {
        return this.value === DEFAULT_CHAT_TITLE;
    }

    equals(other: ChatTitle): boolean {
        return this.value === other.value;
    }
}
