import { describe, expect, it } from 'vitest';
import { AgentRun, AgentRunStateError } from './agent-run';

const start = (): AgentRun =>
    AgentRun.start({ threadId: 't1', runId: 'r1', startedAt: new Date('2026-01-01T00:00:00Z') });

describe('AgentRun', () => {
    it('starts in running with a live signal', () => {
        const run = start();
        expect(run.status).toBe('running');
        expect(run.threadId).toBe('t1');
        expect(run.runId).toBe('r1');
        expect(run.startedAt).toEqual(new Date('2026-01-01T00:00:00Z'));
        expect(run.signal.aborted).toBe(false);
    });

    it.each([
        ['finish', 'finished'],
        ['fail', 'failed'],
        ['cancel', 'cancelled'],
    ] as const)('%s() moves running to %s', (method, status) => {
        const run = start();
        run[method]();
        expect(run.status).toBe(status);
    });

    it('allows only one terminal transition', () => {
        for (const first of ['finish', 'fail', 'cancel'] as const) {
            for (const second of ['finish', 'fail', 'cancel'] as const) {
                const run = start();
                run[first]();
                const after = run.status;
                expect(() => {
                    run[second]();
                }).toThrow(AgentRunStateError);
                expect(run.status).toBe(after);
            }
        }
    });

    it('cancel() aborts the signal', () => {
        const run = start();
        run.cancel();
        expect(run.signal.aborted).toBe(true);
    });

    it('finish() and fail() do not abort the signal', () => {
        const a = start();
        a.finish();
        const b = start();
        b.fail();
        expect(a.signal.aborted).toBe(false);
        expect(b.signal.aborted).toBe(false);
    });

    it('a rejected second cancel does not change the aborted signal state', () => {
        const run = start();
        run.finish();
        expect(() => {
            run.cancel();
        }).toThrow(AgentRunStateError);
        expect(run.signal.aborted).toBe(false);
    });
});
