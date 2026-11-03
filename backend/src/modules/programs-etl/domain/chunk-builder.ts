import { createChunkDraft, type SectionType } from './value-objects';
import type { ParsedProgram } from './sheet-parser';

export type ChunkDraft = ReturnType<typeof createChunkDraft>;

const LEVEL_LABELS: Record<ParsedProgram['level'], string> = {
    spo: 'СПО',
    bachelor: 'Бакалавриат',
    specialist: 'Специалитет',
    master: 'Магистратура',
    postgrad: 'Аспирантура',
    dpo_pp: 'Профессиональная переподготовка',
    dpo_pk: 'Повышение квалификации',
    short_course: 'Краткосрочный курс',
    kids: 'Детская программа',
    camp: 'Лагерь',
};

function splitByParagraphs(text: string, limit: number): string[] {
    const paragraphs = text
        .trim()
        .split(/\r?\n\s*\r?\n/u)
        .filter((paragraph) => paragraph.trim());
    const chunks: string[] = [];
    let current = '';
    for (const paragraph of paragraphs) {
        if (current && current.length + 2 + paragraph.length > limit) {
            chunks.push(current);
            current = paragraph;
        } else {
            current = current ? `${current}\n\n${paragraph}` : paragraph;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

export class ChunkBuilder {
    constructor(private readonly maxLength = 1200) {
        if (!Number.isSafeInteger(maxLength) || maxLength < 1)
            throw new Error('Invalid chunk length');
    }

    build(program: ParsedProgram): ChunkDraft[] {
        const about = program.sections.find((section) => section.sectionType === 'about');
        const summary = about?.text
            .trim()
            .split(/\r?\n\s*\r?\n/u)[0]
            ?.slice(0, 240);
        const card = [
            program.title,
            LEVEL_LABELS[program.level],
            program.qualification !== null && program.qualification !== ''
                ? `Квалификация: ${program.qualification}`
                : null,
            summary ?? null,
        ]
            .filter((part): part is string => part !== null && part !== '')
            .join('\n');
        const chunks: ChunkDraft[] = [
            createChunkDraft({
                programKey: program.programKey,
                sectionType: 'about',
                chunkNo: 0,
                text: card,
                sourceRowNo: program.sourceRowNo,
            }),
        ];
        const nextNo = new Map<SectionType, number>([['about', 1]]);
        for (const section of program.sections) {
            for (const text of splitByParagraphs(section.text, this.maxLength)) {
                const chunkNo = nextNo.get(section.sectionType) ?? 0;
                chunks.push(
                    createChunkDraft({
                        programKey: program.programKey,
                        sectionType: section.sectionType,
                        chunkNo,
                        text,
                        sourceRowNo: section.sourceRowNo,
                    }),
                );
                nextNo.set(section.sectionType, chunkNo + 1);
            }
        }
        return chunks;
    }
}
