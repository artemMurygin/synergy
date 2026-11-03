import { describe, expect, it } from 'vitest';
import { SECTION_TYPES } from './value-objects';
import { ChunkBuilder } from './chunk-builder';
import type { ParsedProgram } from './sheet-parser';

const program: ParsedProgram = {
    programKey: 'university|Тестовый университет|spo|34.02.01||Медицинская сестра',
    organization: { kind: 'university', name: 'Тестовый университет' },
    level: 'spo',
    title: 'Сестринское дело',
    directionCode: '34.02.01',
    qualification: 'Медицинская сестра',
    profile: null,
    faculty: null,
    location: null,
    sourceRowNo: 4,
    offers: [],
    requirements: [],
    sections: [
        { sectionType: 'about', text: 'Первый абзац.\n\nВторой абзац.', sourceRowNo: 4 },
        {
            sectionType: 'curriculum',
            text: 'Предмет А.\n\nПредмет Б.\n\nПредмет В.',
            sourceRowNo: 7,
        },
        { sectionType: 'careers', text: 'Выпускники работают в клиниках.', sourceRowNo: 8 },
    ],
};

describe('ChunkBuilder', () => {
    it('creates a searchable program card as about/0 and preserves source prose as about/1+', () => {
        const chunks = new ChunkBuilder(24).build(program);
        expect(chunks[0]).toMatchObject({
            programKey: program.programKey,
            sectionType: 'about',
            chunkNo: 0,
            sourceRowNo: 4,
        });
        expect(chunks[0].text).toContain('Сестринское дело');
        expect(chunks[0].text).toContain('СПО');
        expect(chunks[0].text).toContain('Медицинская сестра');
        const about = chunks.filter((chunk) => chunk.sectionType === 'about' && chunk.chunkNo > 0);
        expect(about.map((chunk) => chunk.text).join('\n\n')).toBe(
            'Первый абзац.\n\nВторой абзац.',
        );
        expect(about.map((chunk) => chunk.chunkNo)).toEqual([1, 2]);
    });

    it('splits long prose at paragraph boundaries and numbers each section independently', () => {
        const chunks = new ChunkBuilder(24).build(program);
        const curriculum = chunks.filter((chunk) => chunk.sectionType === 'curriculum');
        expect(curriculum.map((chunk) => chunk.chunkNo)).toEqual([0, 1]);
        expect(curriculum.map((chunk) => chunk.text).join('\n\n')).toBe(
            'Предмет А.\n\nПредмет Б.\n\nПредмет В.',
        );
        expect(curriculum.every((chunk) => chunk.sourceRowNo === 7)).toBe(true);
        expect(chunks.find((chunk) => chunk.sectionType === 'careers')).toMatchObject({
            chunkNo: 0,
            text: 'Выпускники работают в клиниках.',
            sourceRowNo: 8,
        });
    });

    it('uses only section types accepted by content_chunk', () => {
        const chunks = new ChunkBuilder().build(program);
        expect(chunks.every((chunk) => SECTION_TYPES.includes(chunk.sectionType))).toBe(true);
    });
});
