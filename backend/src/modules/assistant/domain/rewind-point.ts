/** Where a restart from a user question rolls the chat back to. */
export interface RewindPoint {
    /** Id of the question as in the history. */
    readonly messageId: string;
    /** Files of the question, in the order of sending: the new question keeps them. */
    readonly attachments: readonly string[];
    /** Last agent checkpoint before the question; null when the question opened the context. */
    readonly checkpointId: string | null;
}

/** What replaces the question and everything after it. */
export interface ReplacementMessage {
    readonly text: string;
    readonly attachments: readonly string[];
    readonly checkpointId: string | null;
}
