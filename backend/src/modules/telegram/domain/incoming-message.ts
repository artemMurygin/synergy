import { ArgumentInvalidError } from '../../../shared/errors';
import type { MessageContent } from './message-content';
import type { TelegramIdentity } from './telegram-identity';

export interface IncomingMessageInput {
    readonly updateId: number;
    readonly sender: TelegramIdentity;
    readonly content: MessageContent;
}

export class IncomingMessage {
    private constructor(
        readonly updateId: number,
        readonly sender: TelegramIdentity,
        readonly content: MessageContent,
    ) {}

    static of(input: IncomingMessageInput): IncomingMessage {
        if (!Number.isSafeInteger(input.updateId) || input.updateId < 0) {
            throw new ArgumentInvalidError('Update id must be a non-negative integer');
        }
        return new IncomingMessage(input.updateId, input.sender, input.content);
    }
}
