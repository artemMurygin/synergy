import { describe, expect, it } from 'vitest';
import type { AgentRun } from '../domain/agent-run';
import { ActiveRunRegistry } from './active-run-registry';

function start(registry: ActiveRunRegistry, threadId: string, runId: string): AgentRun {
    const run = registry.tryStart(threadId, runId);
    if (!run) throw new Error('run was not started');
    return run;
}

describe('ActiveRunRegistry', () => {
    it('starts a run and rejects a second run in the same chat', () => {
        const registry = new ActiveRunRegistry();

        const first = registry.tryStart('t1', 'r1');

        expect(first).not.toBeNull();
        expect(first?.threadId).toBe('t1');
        expect(first?.runId).toBe('r1');
        expect(registry.tryStart('t1', 'r2')).toBeNull();
        expect(registry.get('t1')).toBe(first);
    });

    it('allows independent runs in different chats', () => {
        const registry = new ActiveRunRegistry();

        expect(registry.tryStart('t1', 'r1')).not.toBeNull();
        expect(registry.tryStart('t2', 'r2')).not.toBeNull();
    });

    it('reports isRunning only for chats with a run', () => {
        const registry = new ActiveRunRegistry();
        registry.tryStart('t1', 'r1');

        expect(registry.isRunning('t1')).toBe(true);
        expect(registry.isRunning('t2')).toBe(false);
        expect(registry.get('t2')).toBeUndefined();
    });

    it('cancel aborts the run signal and marks it cancelled', () => {
        const registry = new ActiveRunRegistry();
        const run = start(registry, 't1', 'r1');

        registry.cancel('t1');

        expect(run.signal.aborted).toBe(true);
        expect(run.status).toBe('cancelled');
    });

    it('cancel is idempotent for a chat without a run and for repeated calls', () => {
        const registry = new ActiveRunRegistry();

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
        const registry = new ActiveRunRegistry();
        const run = start(registry, 't1', 'r1');
        run.finish();

        expect(() => {
            registry.cancel('t1');
        }).not.toThrow();
        expect(run.signal.aborted).toBe(false);
    });

    it('release removes the entry only when runId matches', () => {
        const registry = new ActiveRunRegistry();
        registry.tryStart('t1', 'r1');

        registry.release('t1', 'other');
        expect(registry.isRunning('t1')).toBe(true);

        registry.release('t1', 'r1');
        expect(registry.isRunning('t1')).toBe(false);
    });

    it('allows a new run after release', () => {
        const registry = new ActiveRunRegistry();
        registry.tryStart('t1', 'r1');
        registry.release('t1', 'r1');

        expect(registry.tryStart('t1', 'r2')).not.toBeNull();
    });

    it('cancelAll aborts every running run and skips finished ones', () => {
        const registry = new ActiveRunRegistry();
        const a = start(registry, 't1', 'r1');
        const b = start(registry, 't2', 'r2');
        const done = start(registry, 't3', 'r3');
        done.finish();

        registry.cancelAll();

        expect(a.status).toBe('cancelled');
        expect(b.signal.aborted).toBe(true);
        expect(done.signal.aborted).toBe(false);
    });

    describe('system message holds', () => {
        it('gives no hold while the chat has a run', () => {
            const registry = new ActiveRunRegistry();
            registry.tryStart('t1', 'r1');

            expect(registry.holdForSystemMessage('t1')).toBeNull();
            expect(registry.holdForSystemMessage('t2')).not.toBeNull();
        });

        it('a hold is not an active run', () => {
            const registry = new ActiveRunRegistry();
            registry.holdForSystemMessage('t1');

            expect(registry.isRunning('t1')).toBe(false);
            expect(registry.get('t1')).toBeUndefined();
        });

        it('starts a run only after every hold of the chat is released', async () => {
            const registry = new ActiveRunRegistry();
            const first = registry.holdForSystemMessage('t1');
            const second = registry.holdForSystemMessage('t1');
            let started: AgentRun | null = null;

            const starting = registry.startAfterSystemMessages('t1', 'r1').then((run) => {
                started = run;
            });
            await Promise.resolve();
            first?.release();
            await Promise.resolve();
            expect(started).toBeNull();
            expect(registry.isRunning('t1')).toBe(false);

            second?.release();
            await starting;
            expect(started).not.toBeNull();
            expect(registry.isRunning('t1')).toBe(true);
        });

        it('starts at once in a chat without holds and does not wait for holds of other chats', async () => {
            const registry = new ActiveRunRegistry();
            registry.holdForSystemMessage('t2');

            const run = await registry.startAfterSystemMessages('t1', 'r1');

            expect(run?.threadId).toBe('t1');
        });

        it('returns null when another run takes the chat while waiting', async () => {
            const registry = new ActiveRunRegistry();
            const hold = registry.holdForSystemMessage('t1');
            const first = registry.startAfterSystemMessages('t1', 'r1');
            const second = registry.startAfterSystemMessages('t1', 'r2');

            hold?.release();
            const runs = await Promise.all([first, second]);

            expect(runs.filter((run) => run !== null)).toHaveLength(1);
        });

        it('a released hold is released once', () => {
            const registry = new ActiveRunRegistry();
            const hold = registry.holdForSystemMessage('t1');
            hold?.release();
            hold?.release();

            expect(registry.tryStart('t1', 'r1')).not.toBeNull();
        });
    });
});
