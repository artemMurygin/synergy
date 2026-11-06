import { describe, expect, it } from 'vitest';
import type { AgentRun } from '../domain/agent-run';
import { InMemoryActiveRunRegistry } from './in-memory-active-run-registry';

function start(registry: InMemoryActiveRunRegistry, threadId: string, runId: string): AgentRun {
    const run = registry.tryStart(threadId, runId);
    if (!run) throw new Error('run was not started');
    return run;
}

describe('InMemoryActiveRunRegistry', () => {
    it('starts a run and rejects a second run in the same chat', () => {
        const registry = new InMemoryActiveRunRegistry();

        const first = registry.tryStart('t1', 'r1');

        expect(first).not.toBeNull();
        expect(first?.threadId).toBe('t1');
        expect(first?.runId).toBe('r1');
        expect(registry.tryStart('t1', 'r2')).toBeNull();
        expect(registry.get('t1')).toBe(first);
    });

    it('allows independent runs in different chats', () => {
        const registry = new InMemoryActiveRunRegistry();

        expect(registry.tryStart('t1', 'r1')).not.toBeNull();
        expect(registry.tryStart('t2', 'r2')).not.toBeNull();
    });

    it('reports isRunning only for chats with a run', () => {
        const registry = new InMemoryActiveRunRegistry();
        registry.tryStart('t1', 'r1');

        expect(registry.isRunning('t1')).toBe(true);
        expect(registry.isRunning('t2')).toBe(false);
        expect(registry.get('t2')).toBeUndefined();
    });

    it('cancel aborts the run signal and marks it cancelled', () => {
        const registry = new InMemoryActiveRunRegistry();
        const run = start(registry, 't1', 'r1');

        registry.cancel('t1');

        expect(run.signal.aborted).toBe(true);
        expect(run.status).toBe('cancelled');
    });

    it('cancel is idempotent for a chat without a run and for repeated calls', () => {
        const registry = new InMemoryActiveRunRegistry();

        expect(() => {
            registry.cancel('none');
        }).not.toThrow();

        registry.tryStart('t1', 'r1');
        registry.cancel('t1');
        expect(() => {
            registry.cancel('t1');
        }).not.toThrow();
    });

    it('cancel does not throw for a run that already finished but is not released', () => {
        const registry = new InMemoryActiveRunRegistry();
        const run = start(registry, 't1', 'r1');
        run.finish();

        expect(() => {
            registry.cancel('t1');
        }).not.toThrow();
        expect(run.signal.aborted).toBe(false);
    });

    it('release removes the entry only when runId matches', () => {
        const registry = new InMemoryActiveRunRegistry();
        registry.tryStart('t1', 'r1');

        registry.release('t1', 'other');
        expect(registry.isRunning('t1')).toBe(true);

        registry.release('t1', 'r1');
        expect(registry.isRunning('t1')).toBe(false);
    });

    it('allows a new run after release', () => {
        const registry = new InMemoryActiveRunRegistry();
        registry.tryStart('t1', 'r1');
        registry.release('t1', 'r1');

        expect(registry.tryStart('t1', 'r2')).not.toBeNull();
    });

    it('cancelAll aborts every running run and skips finished ones', () => {
        const registry = new InMemoryActiveRunRegistry();
        const a = start(registry, 't1', 'r1');
        const b = start(registry, 't2', 'r2');
        const done = start(registry, 't3', 'r3');
        done.finish();

        registry.cancelAll();

        expect(a.status).toBe('cancelled');
        expect(b.signal.aborted).toBe(true);
        expect(done.signal.aborted).toBe(false);
    });
});
