import { AgentRun } from '../domain/agent-run';
import {
    ActiveRunRegistryPort,
    type SystemMessageHold,
} from '../domain/ports/active-run-registry.port';

export class ActiveRunRegistry extends ActiveRunRegistryPort {
    private readonly runs = new Map<string, AgentRun>();
    private readonly holdsByThread = new Map<string, Set<Promise<void>>>();

    tryStart(threadId: string, runId: string): AgentRun | null {
        if (this.runs.has(threadId)) {
            return null;
        }
        const run = AgentRun.start({ threadId, runId });
        this.runs.set(threadId, run);
        return run;
    }

    async startAfterSystemMessages(threadId: string, runId: string): Promise<AgentRun | null> {
        let holds = this.holdsByThread.get(threadId);
        while (holds !== undefined) {
            await Promise.all(holds);
            holds = this.holdsByThread.get(threadId);
        }
        return this.tryStart(threadId, runId);
    }

    holdForSystemMessage(threadId: string): SystemMessageHold | null {
        if (this.runs.has(threadId)) return null;
        let resolveHold: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
            resolveHold = resolve;
        });
        const holds = this.holdsByThread.get(threadId) ?? new Set<Promise<void>>();
        holds.add(held);
        this.holdsByThread.set(threadId, holds);
        return {
            release: (): void => {
                holds.delete(held);
                if (holds.size === 0 && this.holdsByThread.get(threadId) === holds) {
                    this.holdsByThread.delete(threadId);
                }
                resolveHold();
            },
        };
    }

    get(threadId: string): AgentRun | undefined {
        return this.runs.get(threadId);
    }

    isRunning(threadId: string): boolean {
        return this.runs.has(threadId);
    }

    cancel(threadId: string): void {
        const run = this.runs.get(threadId);
        if (run?.status === 'running') {
            run.cancel();
        }
    }

    cancelAll(): void {
        for (const run of this.runs.values()) {
            if (run.status === 'running') {
                run.cancel();
            }
        }
    }

    release(threadId: string, runId: string): void {
        if (this.runs.get(threadId)?.runId === runId) {
            this.runs.delete(threadId);
        }
    }
}
