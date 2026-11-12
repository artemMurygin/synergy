import { describe, expect, it } from 'vitest';
import { DocumentModel, InvalidDocumentModelError } from './document-model';

describe('DocumentModel', () => {
    it('keeps the title and blocks in order', () => {
        const doc = DocumentModel.of({
            title: '  Расшифровка — встреча  ',
            blocks: [
                { kind: 'heading', text: 'Участники' },
                { kind: 'paragraph', text: 'Анна, Спикер 2' },
                { kind: 'table', header: ['№', 'Задача'], rows: [['1', 'Отчёт']] },
            ],
        });

        expect(doc.title).toBe('Расшифровка — встреча');
        expect(doc.blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'table']);
    });

    it('is immutable', () => {
        const doc = DocumentModel.of({ title: 'Док', blocks: [{ kind: 'paragraph', text: 'а' }] });

        expect(Object.isFrozen(doc)).toBe(true);
        expect(Object.isFrozen(doc.blocks)).toBe(true);
    });

    it('rejects an empty title', () => {
        expect(() => DocumentModel.of({ title: '   ', blocks: [] })).toThrow(
            InvalidDocumentModelError,
        );
    });

    it('rejects a table without columns', () => {
        expect(() =>
            DocumentModel.of({ title: 'Док', blocks: [{ kind: 'table', header: [], rows: [] }] }),
        ).toThrow(InvalidDocumentModelError);
    });

    it('rejects a table row whose width differs from the header', () => {
        expect(() =>
            DocumentModel.of({
                title: 'Док',
                blocks: [{ kind: 'table', header: ['№', 'Задача'], rows: [['1']] }],
            }),
        ).toThrow(InvalidDocumentModelError);
    });
});
