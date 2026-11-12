import { describe, expect, it } from 'vitest';
import { InvalidNotificationTargetError, NotificationTarget } from './notification-target';

describe('NotificationTarget', () => {
    it('points at a task by id', () => {
        const target = NotificationTarget.of({ type: 'task', id: 'task-1' });

        expect(target.type).toBe('task');
        expect(target.id).toBe('task-1');
    });

    it.each([[''], ['   ']])('requires an id (%j)', (id) => {
        expect(() => NotificationTarget.of({ type: 'task', id })).toThrow(
            InvalidNotificationTargetError,
        );
    });

    it('points at a chat by id', () => {
        const target = NotificationTarget.of({ type: 'chat', id: 'chat-1' });

        expect(target.type).toBe('chat');
        expect(target.id).toBe('chat-1');
        expect(target.equals(NotificationTarget.of({ type: 'task', id: 'chat-1' }))).toBe(false);
    });

    it.each([['deal'], ['Task'], ['Chat'], ['']])(
        'accepts only the known types, not %j',
        (type) => {
            expect(() => NotificationTarget.of({ type, id: 'x-1' })).toThrow(
                InvalidNotificationTargetError,
            );
        },
    );

    it('compares by value', () => {
        const target = NotificationTarget.of({ type: 'task', id: 'task-1' });

        expect(target.equals(NotificationTarget.of({ type: 'task', id: 'task-1' }))).toBe(true);
        expect(target.equals(NotificationTarget.of({ type: 'task', id: 'task-2' }))).toBe(false);
    });
});
