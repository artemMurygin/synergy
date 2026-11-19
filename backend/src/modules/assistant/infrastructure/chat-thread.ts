import { ChatThreadPort } from '../domain/ports/chat-thread.port';

/** What ChatThread needs of the checkpointer (PostgresSaver in production). */
export interface ThreadCheckpointer {
    getTuple(config: {
        configurable: Record<string, string>;
    }): Promise<{ config: { configurable?: Record<string, unknown> } } | undefined>;
    deleteThread(threadId: string): Promise<void>;
}

/** Reads and removes the agent context of a chat in the LangGraph checkpointer tables. */
export class ChatThread extends ChatThreadPort {
    constructor(private readonly checkpointer: ThreadCheckpointer) {
        super();
    }

    async deleteThread(sessionId: string): Promise<void> {
        await this.checkpointer.deleteThread(sessionId);
    }

    async latestCheckpointId(sessionId: string): Promise<string | null> {
        // Without checkpoint_id the saver returns the newest checkpoint of the namespace, which
        // after a fork is the head of the new branch. Subgraph checkpoints live in other namespaces.
        const tuple = await this.checkpointer.getTuple({
            configurable: { thread_id: sessionId, checkpoint_ns: '' },
        });
        const id = tuple?.config.configurable?.checkpoint_id;
        return typeof id === 'string' ? id : null;
    }
}
