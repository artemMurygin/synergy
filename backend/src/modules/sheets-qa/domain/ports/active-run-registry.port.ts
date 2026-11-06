import type { AgentRun } from '../agent-run';

export abstract class ActiveRunRegistryPort {
    abstract tryStart(threadId: string, runId: string): AgentRun | null;

    abstract get(threadId: string): AgentRun | undefined;

    abstract isRunning(threadId: string): boolean;

    abstract cancel(threadId: string): void;

    abstract cancelAll(): void;

    abstract release(threadId: string, runId: string): void;
}
