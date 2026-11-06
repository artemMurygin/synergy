/** A chat already has an active agent run. */
export class RunConflictError extends Error {
    constructor(readonly threadId: string) {
        super(`Chat already has an active run: ${threadId}`);
    }
}
