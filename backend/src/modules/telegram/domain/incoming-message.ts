import { ArgumentInvalidError } from '../../../shared/errors';
import type { TelegramIdentity } from './telegram-identity';

export interface IncomingMessageInput {
    readonly updateId: number;
    readonly sender: TelegramIdentity;
    readonly text: string;
}

export class IncomingMessage {
    private constructor(
        readonly updateId: number,
        readonly sender: TelegramIdentity,
        readonly text: string,
    ) {}

    static of(input: IncomingMessageInput): IncomingMessage {
        if (!Number.isSafeInteger(input.updateId) || input.updateId < 0) {
            throw new ArgumentInvalidError('Update id must be a non-negative integer');
        }
        return new IncomingMessage(input.updateId, input.sender, input.text);
    }
}
