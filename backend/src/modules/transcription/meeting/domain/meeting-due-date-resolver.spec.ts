import { describe, expect, it } from 'vitest';
import { MeetingDueDateResolver } from './meeting-due-date-resolver';

// Среда, 11 ноября 2026, 14:00 по Москве.
const WEDNESDAY = new Date('2026-11-11T11:00:00Z');
// Пятница, 13 ноября 2026, 01:00 по Москве (в UTC ещё четверг).
const FRIDAY_NIGHT = new Date('2026-11-12T22:00:00Z');

/** Ожидаемый момент: дата и время по Москве (UTC+3). */
function msk(isoLocal: string): Date {
    return new Date(`${isoLocal}:00+03:00`);
}

describe('MeetingDueDateResolver', () => {
    it.each([
        ['до пятницы', '2026-11-13T18:00'],
        ['к пятнице', '2026-11-13T18:00'],
        ['в понедельник', '2026-11-16T18:00'],
        ['до среды', '2026-11-18T18:00'],
        ['сегодня', '2026-11-11T18:00'],
        ['завтра', '2026-11-12T18:00'],
        ['послезавтра', '2026-11-13T18:00'],
        ['через неделю', '2026-11-18T18:00'],
        ['через 3 дня', '2026-11-14T18:00'],
        ['через две недели', '2026-11-25T18:00'],
        ['до конца недели', '2026-11-13T18:00'],
        ['до конца месяца', '2026-11-30T18:00'],
        ['до 20 ноября', '2026-11-20T18:00'],
        ['к 5 января', '2027-01-05T18:00'],
        ['до 25.11', '2026-11-25T18:00'],
        ['до 01.12.2026', '2026-12-01T18:00'],
        ['завтра к 12:30', '2026-11-12T12:30'],
        ['в пятницу в 10 часов', '2026-11-13T10:00'],
    ])('resolves "%s" from the meeting date', (text, expected) => {
        expect(MeetingDueDateResolver.resolve(text, WEDNESDAY)).toEqual(msk(expected));
    });

    it('counts from the upload date of the recording, not from today', () => {
        const longAgo = new Date('2026-01-14T09:00:00Z'); // среда

        expect(MeetingDueDateResolver.resolve('до пятницы', longAgo)).toEqual(
            msk('2026-01-16T18:00'),
        );
    });

    it('uses the Moscow day of the meeting', () => {
        // По Москве уже пятница: «до пятницы» — следующая неделя, «завтра» — суббота.
        expect(MeetingDueDateResolver.resolve('до пятницы', FRIDAY_NIGHT)).toEqual(
            msk('2026-11-20T18:00'),
        );
        expect(MeetingDueDateResolver.resolve('завтра', FRIDAY_NIGHT)).toEqual(
            msk('2026-11-14T18:00'),
        );
    });

    it.each([null, '', '   ', 'как можно скорее', 'потом', 'когда будет время', '31.02'])(
        'gives null for an unclear due text %j',
        (text) => {
            expect(MeetingDueDateResolver.resolve(text, WEDNESDAY)).toBeNull();
        },
    );
});
