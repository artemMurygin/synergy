import { describe, expect, it } from 'vitest';
import {
    InvalidNotificationContentError,
    MAX_NOTIFICATION_BODY_LENGTH,
    MAX_NOTIFICATION_TITLE_LENGTH,
    NotificationContent,
} from './notification-content';

describe('NotificationContent', () => {
    it('trims the title and the body', () => {
        const content = NotificationContent.of({
            title: '  Вам назначена задача \n',
            body: '\t anna назначила вас ответственным: КП  ',
        });

        expect(content.title).toBe('Вам назначена задача');
        expect(content.body).toBe('anna назначила вас ответственным: КП');
    });

    it('limits the title to 1–200 characters', () => {
        expect(MAX_NOTIFICATION_TITLE_LENGTH).toBe(200);
        expect(NotificationContent.of({ title: 'Т', body: '' }).title).toBe('Т');
        expect(
            NotificationContent.of({ title: 'Т'.repeat(MAX_NOTIFICATION_TITLE_LENGTH), body: '' })
                .title,
        ).toHaveLength(MAX_NOTIFICATION_TITLE_LENGTH);
        expect(() =>
            NotificationContent.of({
                title: 'Т'.repeat(MAX_NOTIFICATION_TITLE_LENGTH + 1),
                body: '',
            }),
        ).toThrow(InvalidNotificationContentError);
    });

    it.each([[''], ['   ']])('rejects a title that is empty after trimming (%j)', (title) => {
        expect(() => NotificationContent.of({ title, body: 'текст' })).toThrow(
            InvalidNotificationContentError,
        );
    });

    it('limits the body to 0–1000 characters', () => {
        expect(MAX_NOTIFICATION_BODY_LENGTH).toBe(1000);
        expect(NotificationContent.of({ title: 'Т', body: '   ' }).body).toBe('');
        expect(
            NotificationContent.of({ title: 'Т', body: 'б'.repeat(MAX_NOTIFICATION_BODY_LENGTH) })
                .body,
        ).toHaveLength(MAX_NOTIFICATION_BODY_LENGTH);
        expect(() =>
            NotificationContent.of({
                title: 'Т',
                body: 'б'.repeat(MAX_NOTIFICATION_BODY_LENGTH + 1),
            }),
        ).toThrow(InvalidNotificationContentError);
    });

    it('measures the length after trimming', () => {
        const padded = `  ${'Т'.repeat(MAX_NOTIFICATION_TITLE_LENGTH)}  `;

        expect(NotificationContent.of({ title: padded, body: '' }).title).toHaveLength(
            MAX_NOTIFICATION_TITLE_LENGTH,
        );
    });

    it('compares by value', () => {
        const first = NotificationContent.of({ title: 'Заголовок', body: 'Текст' });

        expect(first.equals(NotificationContent.of({ title: ' Заголовок ', body: 'Текст' }))).toBe(
            true,
        );
        expect(first.equals(NotificationContent.of({ title: 'Заголовок', body: 'Другой' }))).toBe(
            false,
        );
    });
});
