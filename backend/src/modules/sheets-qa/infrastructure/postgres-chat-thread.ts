import type { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ChatThreadPort } from '../domain/ports/chat-thread.port';

/** Removes the agent context of a chat from the LangGraph checkpointer tables. */
export class PostgresChatThread extends ChatThreadPort {
    constructor(private readonly checkpointer: PostgresSaver) {
        super();
    }

    async deleteThread(sessionId: string): Promise<void> {
        await this.checkpointer.deleteThread(sessionId);
    }
}
