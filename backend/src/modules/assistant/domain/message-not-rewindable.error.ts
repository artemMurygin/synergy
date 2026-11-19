/** The question was stored before rewind points existed: the answer cannot be restarted from it. */
export class MessageNotRewindableError extends Error {
    constructor(readonly messageId: string) {
        super(`Message cannot be edited: ${messageId}`);
    }
}
