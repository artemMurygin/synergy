export class ChatSessionNotFoundError extends Error {
    constructor(readonly sessionId: string) {
        super(`Chat session not found: ${sessionId}`);
    }
}
