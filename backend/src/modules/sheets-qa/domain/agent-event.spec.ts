import { describe, expect, it } from 'vitest';
import { AgentEvent } from './agent-event';

describe('AgentEvent', () => {
    it('builds every variant with its type tag and payload', () => {
        expect(AgentEvent.runStarted()).toEqual({ type: 'run-started' });
        expect(AgentEvent.textDelta('при')).toEqual({ type: 'text-delta', text: 'при' });
        expect(AgentEvent.toolCallStarted('c1', 'read_sheet', { a: 1 })).toEqual({
            type: 'tool-call-started',
            callId: 'c1',
            name: 'read_sheet',
            args: { a: 1 },
        });
        expect(AgentEvent.toolCallFinished('c1')).toEqual({
            type: 'tool-call-finished',
            callId: 'c1',
        });
        expect(
            AgentEvent.runFinished({
                answer: 'ok',
                toolCalls: [{ name: 'x', args: {} }],
                durationMs: 12,
            }),
        ).toEqual({
            type: 'run-finished',
            answer: 'ok',
            toolCalls: [{ name: 'x', args: {} }],
            durationMs: 12,
        });
        expect(AgentEvent.runFailed('boom')).toEqual({ type: 'run-failed', message: 'boom' });
        expect(AgentEvent.runCancelled()).toEqual({ type: 'run-cancelled' });
    });

    it('narrows by type', () => {
        const event: AgentEvent = AgentEvent.textDelta('x');
        if (event.type === 'text-delta') expect(event.text).toBe('x');
        else throw new Error('unreachable');
    });

    it('isTerminal is true only for finished, failed and cancelled', () => {
        expect(
            AgentEvent.isTerminal(
                AgentEvent.runFinished({ answer: '', toolCalls: [], durationMs: 0 }),
            ),
        ).toBe(true);
        expect(AgentEvent.isTerminal(AgentEvent.runFailed('e'))).toBe(true);
        expect(AgentEvent.isTerminal(AgentEvent.runCancelled())).toBe(true);
        expect(AgentEvent.isTerminal(AgentEvent.runStarted())).toBe(false);
        expect(AgentEvent.isTerminal(AgentEvent.textDelta('a'))).toBe(false);
        expect(AgentEvent.isTerminal(AgentEvent.toolCallFinished('c'))).toBe(false);
    });
});
