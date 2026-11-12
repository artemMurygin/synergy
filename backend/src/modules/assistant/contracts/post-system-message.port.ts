import type { SystemMessageCommand } from './system-message.command';

/**
 * Contract of the assistant module for other modules: post a system message into a chat.
 * Delivery is asynchronous: the message waits while the chat has an active run (up to a deadline)
 * and a repeated request with the same dedupKey adds nothing.
 */
export abstract class PostSystemMessagePort {
    abstract request(command: SystemMessageCommand): Promise<void>;
}
