export interface ToolCallTrace {
    readonly name: string;
    readonly args: unknown;
    /** How long the call took; absent in traces stored before it was measured. */
    readonly durationMs?: number;
}
