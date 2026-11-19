/** The agent's persisted conversation context, keyed by chat session id. */
export abstract class ChatThreadPort {
    /** Removes the agent context of the session; a missing thread is not an error. */
    abstract deleteThread(sessionId: string): Promise<void>;
    /**
     * Id of the last checkpoint of the main graph (checkpoint_ns = ''); null when the chat has
     * no agent context yet.
     */
    abstract latestCheckpointId(sessionId: string): Promise<string | null>;
}
