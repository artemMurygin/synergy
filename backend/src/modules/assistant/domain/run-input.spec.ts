import { describe, expect, it } from 'vitest';
import { AttachmentRef } from '../../../shared/agent-capability';
import {
    InvalidRunInputError,
    MAX_QUESTION_LENGTH,
    MAX_RUN_ATTACHMENTS,
    RunInput,
} from './run-input';

function ref(
    fileId: string,
    overrides: Partial<Parameters<typeof AttachmentRef.of>[0]> = {},
): AttachmentRef {
    return AttachmentRef.of({
        fileId,
        name: `${fileId}.m4a`,
        mediaType: 'audio/mp4',
        kind: 'recording',
        sizeBytes: 1024,
        ...overrides,
    });
}

describe('RunInput', () => {
    it('trims the question and keeps ids', () => {
        const input = RunInput.of({ threadId: 't1', runId: 'r1', question: '  Цены на МВА  ' });
        expect(input.question).toBe('Цены на МВА');
        expect(input.threadId).toBe('t1');
        expect(input.runId).toBe('r1');
    });

    it('accepts a question of exactly MAX_QUESTION_LENGTH after trim', () => {
        const input = RunInput.of({
            threadId: 't1',
            runId: 'r1',
            question: ` ${'a'.repeat(MAX_QUESTION_LENGTH)} `,
        });
        expect(input.question).toHaveLength(MAX_QUESTION_LENGTH);
    });

    it('rejects empty and whitespace-only questions', () => {
        expect(() => RunInput.of({ threadId: 't1', runId: 'r1', question: '' })).toThrow(
            InvalidRunInputError,
        );
        expect(() => RunInput.of({ threadId: 't1', runId: 'r1', question: '  \n ' })).toThrow(
            InvalidRunInputError,
        );
    });

    it('rejects a question longer than MAX_QUESTION_LENGTH', () => {
        expect(() =>
            RunInput.of({
                threadId: 't1',
                runId: 'r1',
                question: 'a'.repeat(MAX_QUESTION_LENGTH + 1),
            }),
        ).toThrow(InvalidRunInputError);
    });

    it('rejects an empty threadId', () => {
        expect(() => RunInput.of({ threadId: '  ', runId: 'r1', question: 'q' })).toThrow(
            InvalidRunInputError,
        );
        expect(() => RunInput.of({ threadId: '', runId: 'r1', question: 'q' })).toThrow(
            InvalidRunInputError,
        );
    });

    describe('attachments', () => {
        it('has no attachments by default', () => {
            expect(RunInput.of({ threadId: 't1', runId: 'r1', question: 'q' }).attachments).toEqual(
                [],
            );
        });

        it('accepts an empty question when there is an attachment', () => {
            const input = RunInput.of({
                threadId: 't1',
                runId: 'r1',
                question: '  ',
                attachments: [ref('f1')],
            });
            expect(input.question).toBe('');
            expect(input.attachments.map((a) => a.fileId)).toEqual(['f1']);
        });

        it('rejects a message without text and without attachments', () => {
            expect(() =>
                RunInput.of({ threadId: 't1', runId: 'r1', question: ' ', attachments: [] }),
            ).toThrow(InvalidRunInputError);
        });

        it(`accepts ${String(MAX_RUN_ATTACHMENTS)} attachments and rejects more`, () => {
            const five = Array.from({ length: MAX_RUN_ATTACHMENTS }, (_, i) =>
                ref(`f${String(i)}`),
            );
            expect(
                RunInput.of({ threadId: 't1', runId: 'r1', question: '', attachments: five })
                    .attachments,
            ).toHaveLength(MAX_RUN_ATTACHMENTS);
            expect(() =>
                RunInput.of({
                    threadId: 't1',
                    runId: 'r1',
                    question: 'q',
                    attachments: [...five, ref('f-extra')],
                }),
            ).toThrow(InvalidRunInputError);
        });

        it('rejects the same file attached twice', () => {
            expect(() =>
                RunInput.of({
                    threadId: 't1',
                    runId: 'r1',
                    question: 'q',
                    attachments: [ref('f1'), ref('f1')],
                }),
            ).toThrow(InvalidRunInputError);
        });

        it('checks the draft (text and number of files) before the files are resolved', () => {
            expect(() => {
                RunInput.assertDraft({ threadId: 't1', question: '', fileCount: 0 });
            }).toThrow(InvalidRunInputError);
            expect(() => {
                RunInput.assertDraft({ threadId: 't1', question: 'q', fileCount: 6 });
            }).toThrow(InvalidRunInputError);
            expect(() => {
                RunInput.assertDraft({ threadId: 't1', question: '', fileCount: 1 });
            }).not.toThrow();
        });
    });

    describe('agentText', () => {
        it('is the question alone without attachments', () => {
            expect(
                RunInput.of({ threadId: 't1', runId: 'r1', question: 'Вопрос' }).agentText(),
            ).toBe('Вопрос');
        });

        it('appends the [Вложения] block with id, name, kind and size of every file in order', () => {
            const input = RunInput.of({
                threadId: 't1',
                runId: 'r1',
                question: 'Расшифруй',
                attachments: [
                    ref('f1', { name: 'встреча.m4a', sizeBytes: 84 * 1024 * 1024 }),
                    ref('f2', {
                        name: 'план.docx',
                        kind: 'document',
                        mediaType:
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        sizeBytes: 2048,
                    }),
                ],
            });
            expect(input.agentText()).toBe(
                [
                    'Расшифруй',
                    '',
                    '[Вложения]',
                    '1. id=f1; встреча.m4a; recording; 84 МБ',
                    '2. id=f2; план.docx; document; 2 КБ',
                ].join('\n'),
            );
        });

        it('is the block alone for a message without text', () => {
            const input = RunInput.of({
                threadId: 't1',
                runId: 'r1',
                question: '',
                attachments: [ref('f1', { sizeBytes: 500 })],
            });
            expect(input.agentText()).toBe('[Вложения]\n1. id=f1; f1.m4a; recording; 500 Б');
        });
    });
});
