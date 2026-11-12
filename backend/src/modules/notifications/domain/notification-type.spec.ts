import { describe, expect, it } from 'vitest';
import {
    InvalidNotificationTypeError,
    NOTIFICATION_TYPES,
    NotificationType,
} from './notification-type';

describe('NotificationType', () => {
    it('knows the task.assigned type', () => {
        expect(NOTIFICATION_TYPES).toContain('task.assigned');
        expect(NotificationType.parse('task.assigned')).toBe('task.assigned');
    });

    it.each([
        ['task.created-on-behalf'],
        ['meeting-transcript.ready'],
        ['meeting-transcript.failed'],
    ])('knows the %s type', (raw) => {
        expect(NOTIFICATION_TYPES).toContain(raw);
        expect(NotificationType.parse(raw)).toBe(raw);
    });

    it.each([['task.created'], ['TASK.ASSIGNED'], [''], ['task.assigned ']])(
        'rejects the unknown type %j',
        (raw) => {
            expect(() => NotificationType.parse(raw)).toThrow(InvalidNotificationTypeError);
        },
    );
});
