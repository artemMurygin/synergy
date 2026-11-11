export type AgentRunStatus = 'running' | 'finished' | 'failed' | 'cancelled';

export class AgentRunStateError extends Error {}

export interface AgentRunStart {
    readonly threadId: string;
    readonly runId: string;
    readonly startedAt?: Date;
}

export class AgentRun {
    private current: AgentRunStatus = 'running';
    private readonly controller = new AbortController();

    private constructor(
        readonly threadId: string,
        readonly runId: string,
        readonly startedAt: Date,
    ) {}

    static start(input: AgentRunStart): AgentRun {
        return new AgentRun(input.threadId, input.runId, input.startedAt ?? new Date());
    }

    get status(): AgentRunStatus {
        return this.current;
    }

    get signal(): AbortSignal {
        return this.controller.signal;
    }

    finish(): void {
        this.transition('finished');
    }

    fail(): void {
        this.transition('failed');
    }

    cancel(): void {
        this.transition('cancelled');
        this.controller.abort();
    }

    private transition(next: Exclude<AgentRunStatus, 'running'>): void {
        if (this.current !== 'running') {
            throw new AgentRunStateError(
                `Run ${this.runId} is already ${this.current}, cannot become ${next}`,
            );
        }
        this.current = next;
    }
}
