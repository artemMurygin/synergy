import { describe, expect, it } from 'vitest';
import { CATALOG_RECORD_TYPES } from '../application/models/catalog-mutation';
import {
    CONTENT_SECTION_TYPES,
    mutationPlanSchema,
    PROGRAMS_AGENT_SYSTEM_PROMPT,
} from './programs-agent-contract';

const ORG = '11111111-1111-4111-8111-111111111111';
const src = [{ source_id: 'book:1', row_numbers: [2] }];

const parse = (operation: unknown): ReturnType<typeof mutationPlanSchema.safeParse> =>
    mutationPlanSchema.safeParse({ operations: [operation] });

describe('programs agent contract', () => {
    it('accepts a minimal valid create for every record type', () => {
        const creates: Record<string, Record<string, unknown>> = {
            organization: { kind: 'university', name: 'Synergy' },
            faculty: { organizationId: ORG, name: 'IT' },
            location: { organizationId: ORG, city: 'Moscow' },
            program: { organizationId: ORG, level: 'spo', title: 'Programming' },
            offer: { programId: ORG, studyForm: 'full_time', baseEducation: 'grade9' },
            price: { offerId: ORG, kind: 'total', amount: 100000, currency: 'RUB' },
            entrance_requirement: { programId: ORG, baseEducation: 'any', subject: 'Math' },
        };
        expect(Object.keys(creates).sort()).toEqual([...CATALOG_RECORD_TYPES].sort());

        for (const [record_type, data] of Object.entries(creates)) {
            const result = parse({ kind: 'create', record_type, data, sources: src });
            expect(result.success, record_type).toBe(true);
        }
    });

    it('accepts { ref } to a local key and program sections', () => {
        const result = mutationPlanSchema.safeParse({
            operations: [
                {
                    kind: 'create',
                    record_type: 'program',
                    local_key: 'p',
                    data: {
                        organizationId: ORG,
                        level: 'bachelor',
                        title: 'Informatics',
                        sections: [{ sectionType: 'about', text: 'Text' }],
                    },
                    sources: src,
                },
                {
                    kind: 'create',
                    record_type: 'offer',
                    data: {
                        programId: { ref: 'p' },
                        studyForm: 'online',
                        baseEducation: 'grade11',
                    },
                    sources: src,
                },
            ],
        });
        expect(result.success).toBe(true);
    });

    it.each([
        [
            'unknown field',
            {
                kind: 'create',
                record_type: 'program',
                data: { organizationId: ORG, level: 'spo', title: 'A', name: 'x' },
            },
        ],
        [
            'create without required field',
            { kind: 'create', record_type: 'program', data: { organizationId: ORG, title: 'A' } },
        ],
        [
            'create with record_id',
            {
                kind: 'create',
                record_type: 'organization',
                record_id: 'x',
                data: { kind: 'college', name: 'A' },
            },
        ],
        ['update without record_id', { kind: 'update', record_type: 'price', data: { amount: 1 } }],
        [
            'invalid enum value',
            {
                kind: 'create',
                record_type: 'program',
                data: { organizationId: ORG, level: 'phd', title: 'A' },
            },
        ],
        [
            'negative amount',
            {
                kind: 'create',
                record_type: 'price',
                data: { offerId: ORG, kind: 'total', amount: -1, currency: 'RUB' },
            },
        ],
        [
            'discounted without condition',
            {
                kind: 'create',
                record_type: 'price',
                data: { offerId: ORG, kind: 'discounted', amount: 1, currency: 'RUB' },
            },
        ],
        [
            'bad date',
            {
                kind: 'create',
                record_type: 'offer',
                data: {
                    programId: ORG,
                    studyForm: 'online',
                    baseEducation: 'any',
                    startDate: '01.09.2026',
                },
            },
        ],
        [
            'sections outside program',
            {
                kind: 'create',
                record_type: 'organization',
                data: { kind: 'college', name: 'A', sections: [] },
            },
        ],
        [
            'unknown section type',
            {
                kind: 'create',
                record_type: 'program',
                data: {
                    organizationId: ORG,
                    level: 'spo',
                    title: 'A',
                    sections: [{ sectionType: 'news', text: 'x' }],
                },
            },
        ],
        [
            'non-uuid parent id',
            {
                kind: 'create',
                record_type: 'faculty',
                data: { organizationId: 'not-a-uuid', name: 'A' },
            },
        ],
    ])('rejects %s', (_name, operation) => {
        expect(parse({ sources: src, ...operation }).success).toBe(false);
    });

    it('allows partial data on update', () => {
        const result = parse({
            kind: 'update',
            record_type: 'price',
            record_id: ORG,
            data: { amount: 120000 },
            sources: src,
        });
        expect(result.success).toBe(true);
    });

    it('accepts an empty plan', () => {
        expect(mutationPlanSchema.safeParse({ operations: [] }).success).toBe(true);
    });

    it('prompt mentions every record type, every section type and the data rules', () => {
        for (const type of CATALOG_RECORD_TYPES) {
            expect(PROGRAMS_AGENT_SYSTEM_PROMPT).toContain(`- ${type}:`);
        }
        for (const section of CONTENT_SECTION_TYPES) {
            expect(PROGRAMS_AGENT_SYSTEM_PROMPT).toContain(section);
        }
        expect(PROGRAMS_AGENT_SYSTEM_PROMPT).toContain('Never delete');
        expect(PROGRAMS_AGENT_SYSTEM_PROMPT).toContain('do not invent');
    });
});
