import { AgentRun } from '../domain/agent-run';
import { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';

/** Process-local registry of active runs keyed by chat id. */
export class InMemoryActiveRunRegistry extends ActiveRunRegistryPort {
    private readonly runs = new Map<string, AgentRun>();

    tryStart(threadId: string, runId: string): AgentRun | null {
        if (this.runs.has(threadId)) {
            return null;
        }
        const run = AgentRun.start({ threadId, runId });
        this.runs.set(threadId, run);
        return run;
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

    release(threadId: string, runId: string): void {
        if (this.runs.get(threadId)?.runId === runId) {
            this.runs.delete(threadId);
        }
    }
}
