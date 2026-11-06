import { describe, expect, it } from 'vitest';
import { ActiveRunsLifecycle } from './active-runs-lifecycle';
import { InMemoryActiveRunRegistry } from './in-memory-active-run-registry';

describe('ActiveRunsLifecycle', () => {
    it('cancels active runs on application shutdown', () => {
        const registry = new InMemoryActiveRunRegistry();
        const run = registry.tryStart('t1', 'r1');

        new ActiveRunsLifecycle(registry).onApplicationShutdown();

        expect(run?.status).toBe('cancelled');
        expect(run?.signal.aborted).toBe(true);
    });
});
