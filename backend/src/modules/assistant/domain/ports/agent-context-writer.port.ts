/** Writes into the agent's persisted conversation context of a chat without running the agent. */
export abstract class AgentContextWriterPort {
    /** Adds a message of the agent to the thread of the chat, as if the agent had written it. */
    abstract appendAssistantMessage(threadId: string, text: string): Promise<void>;
}
