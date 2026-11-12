import { describe, expect, it } from 'vitest';
import { EvidenceValidator } from './evidence-validator';
import type { RawExtractedTask } from './extracted-meeting-task';
import { TranscriptSegment } from './transcript-segment';

const SEGMENTS = new Map(
    [
        TranscriptSegment.of({
            seq: 0,
            speaker: 1,
            startSec: 0,
            endSec: 5,
            text: 'Олег, подготовь смету до пятницы, пожалуйста.',
        }),
        TranscriptSegment.of({
            seq: 1,
            speaker: 2,
            startSec: 5,
            endSec: 9,
            text: 'Ещё надо обновить договор с поставщиком',
        }),
    ].map((s) => [s.seq, s]),
);

function task(overrides: Partial<RawExtractedTask>): RawExtractedTask {
    return {
        title: 'Подготовить смету',
        description: 'Смета',
        assigneeMention: 'Олег',
        dueText: 'до пятницы',
        evidence: { seq: 0, quote: 'подготовь смету до пятницы' },
        ...overrides,
    };
}

describe('EvidenceValidator', () => {
    it('keeps a task whose quote is part of the referenced segment', () => {
        const kept = EvidenceValidator.filter([task({})], SEGMENTS);

        expect(kept).toHaveLength(1);
    });

    it('drops a task without evidence', () => {
        expect(EvidenceValidator.filter([task({ evidence: null })], SEGMENTS)).toEqual([]);
    });

    it('drops a task that references a missing segment', () => {
        expect(
            EvidenceValidator.filter(
                [task({ evidence: { seq: 7, quote: 'подготовь смету' } })],
                SEGMENTS,
            ),
        ).toEqual([]);
    });

    it('drops a task whose quote is not from the referenced segment', () => {
        const fromOtherSegment = task({ evidence: { seq: 0, quote: 'обновить договор' } });
        const invented = task({ evidence: { seq: 1, quote: 'Иван купит сервер' } });

        expect(EvidenceValidator.filter([fromOtherSegment, invented], SEGMENTS)).toEqual([]);
    });

    it('drops a task with an empty quote or title', () => {
        expect(
            EvidenceValidator.filter(
                [task({ evidence: { seq: 0, quote: '   ' } }), task({ title: '  ' })],
                SEGMENTS,
            ),
        ).toEqual([]);
    });

    it('normalizes case, whitespace, «ё» and outer punctuation of the quote', () => {
        const kept = EvidenceValidator.filter(
            [
                task({ evidence: { seq: 0, quote: '  «ОЛЕГ,   подготовь\nсмету»…' } }),
                task({ evidence: { seq: 1, quote: 'ещё НАДО обновить договор' } }),
                task({ evidence: { seq: 1, quote: 'Еще надо обновить договор' } }),
            ],
            SEGMENTS,
        );

        expect(kept).toHaveLength(3);
    });

    it('keeps the order of the tasks that passed', () => {
        const first = task({ title: 'Первая' });
        const dropped = task({ title: 'Лишняя', evidence: { seq: 9, quote: 'x' } });
        const second = task({
            title: 'Вторая',
            evidence: { seq: 1, quote: 'обновить договор с поставщиком' },
        });

        expect(
            EvidenceValidator.filter([first, dropped, second], SEGMENTS).map((t) => t.title),
        ).toEqual(['Первая', 'Вторая']);
    });
});
