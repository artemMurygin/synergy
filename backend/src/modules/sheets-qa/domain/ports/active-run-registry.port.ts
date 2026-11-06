import type { AgentRun } from '../agent-run';

/** Registry of active agent runs, at most one per chat. */
export abstract class ActiveRunRegistryPort {
    /** Registers a new run; returns `null` if the chat already has an active run. */
    abstract tryStart(threadId: string, runId: string): AgentRun | null;

    abstract get(threadId: string): AgentRun | undefined;

    abstract isRunning(threadId: string): boolean;

    /** Aborts the chat's active run; a chat without a run is a no-op. */
    abstract cancel(threadId: string): void;

    /** Aborts every active run (graceful shutdown). */
    abstract cancelAll(): void;

    /** Removes the entry only if it belongs to the given run. */
    abstract release(threadId: string, runId: string): void;
}
