/** The message does not exist in the chat, is not a question of the user, or is foreign: one answer for all. */
export class MessageNotFoundError extends Error {
    constructor(readonly messageId: string) {
        super(`Message not found: ${messageId}`);
    }
}
