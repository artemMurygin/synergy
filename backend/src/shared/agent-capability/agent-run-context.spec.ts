import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../errors';
import { AgentRunContext } from './agent-run-context';
import { RunAttachments } from './run-attachments';

describe('AgentRunContext', () => {
    it('keeps userId and threadId', () => {
        const ctx = AgentRunContext.create({ userId: 'u-1', threadId: 't-1' });

        expect(ctx.userId).toBe('u-1');
        expect(ctx.threadId).toBe('t-1');
    });

    it.each([
        ['empty userId', { userId: '', threadId: 't-1' }],
        ['blank userId', { userId: '   ', threadId: 't-1' }],
        ['empty threadId', { userId: 'u-1', threadId: '' }],
        ['blank threadId', { userId: 'u-1', threadId: '  ' }],
    ])('rejects %s', (_name, props) => {
        expect(() => AgentRunContext.create(props)).toThrow(ArgumentInvalidError);
    });

    it('is immutable', () => {
        const ctx = AgentRunContext.create({ userId: 'u-1', threadId: 't-1' });

        expect(Object.isFrozen(ctx)).toBe(true);
        expect(() => {
            (ctx as { userId: string }).userId = 'u-2';
        }).toThrow(TypeError);
        expect(ctx.userId).toBe('u-1');
    });

    it('does not follow later changes of the source props', () => {
        const props = { userId: 'u-1', threadId: 't-1' };
        const ctx = AgentRunContext.create(props);

        props.userId = 'u-2';

        expect(ctx.userId).toBe('u-1');
    });

    it('gives every run its own empty attachments collector by default', () => {
        const first = AgentRunContext.create({ userId: 'u-1', threadId: 't-1' });
        const second = AgentRunContext.create({ userId: 'u-1', threadId: 't-1' });
        expect(first.attachments).toBeInstanceOf(RunAttachments);
        expect(first.attachments.list()).toEqual([]);
        expect(first.attachments).not.toBe(second.attachments);
    });

    it('keeps the given attachments collector', () => {
        const attachments = RunAttachments.create();
        const ctx = AgentRunContext.create({ userId: 'u-1', threadId: 't-1', attachments });
        expect(ctx.attachments).toBe(attachments);
    });
});
