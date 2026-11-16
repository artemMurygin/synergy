import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CatalogView } from '../../application/get-catalog.use-case';
import { EMPTY_GUIDE, type GuideView } from '../../application/guide-view';
import { CatalogResponse, ProductDepartmentsResponse } from './catalog.responses';
import { GuideResponse } from './guides.responses';

// Контракт фронт—бэк для инструкции и доступа продуктов: фикстуры лежат в портале
// (UPDATE_CONTRACT=1 перезаписывает), портал разбирает их Zod-схемами (portal/src/test/guide-contract.test.ts).
const CONTRACT_DIR = resolve(process.cwd(), '../portal/src/test/contract');
const GUIDES_FILE = resolve(CONTRACT_DIR, 'guide-responses.json');
const DEPARTMENTS_FILE = resolve(CONTRACT_DIR, 'product-departments-response.json');
const CATALOG_FILE = resolve(CONTRACT_DIR, 'catalog-departments-response.json');

const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const NOW = new Date('2026-11-10T09:00:00.000Z');
const KC1 = { id: 'kc-1', name: 'КЦ 1' };
const KC2 = { id: 'kc-2', name: 'КЦ 2' };

const filled: GuideView = {
    body: '# Заголовок\n\n- пункт\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>',
    updatedAt: NOW,
    updatedBy: { id: 'd1', login: 'petrov', fullName: 'Петров Пётр' },
};

describe('GuideResponse contract fixture', () => {
    const actual = [
        { name: 'filled', response: json(new GuideResponse(filled)) },
        { name: 'empty', response: json(new GuideResponse(EMPTY_GUIDE)) },
    ];
    if (process.env.UPDATE_CONTRACT === '1') {
        writeFileSync(GUIDES_FILE, `${JSON.stringify(actual, null, 2)}\n`);
    }
    it('portal fixture equals the real backend response', () => {
        expect(existsSync(GUIDES_FILE)).toBe(true);
        expect(JSON.parse(readFileSync(GUIDES_FILE, 'utf8'))).toEqual(actual);
    });
});

describe('ProductDepartmentsResponse contract fixture', () => {
    const actual = json(
        new ProductDepartmentsResponse({
            id: 'p1',
            slug: 'manager-helper',
            name: 'Manager Helper',
            departments: [KC1, KC2],
        }),
    );
    if (process.env.UPDATE_CONTRACT === '1') {
        writeFileSync(DEPARTMENTS_FILE, `${JSON.stringify(actual, null, 2)}\n`);
    }
    it('portal fixture equals the real backend response', () => {
        expect(existsSync(DEPARTMENTS_FILE)).toBe(true);
        expect(JSON.parse(readFileSync(DEPARTMENTS_FILE, 'utf8'))).toEqual(actual);
    });
});

describe('CatalogResponse with departments contract fixture', () => {
    const view: CatalogView = {
        products: [
            {
                id: 'p1',
                slug: 'manager-helper',
                name: 'Manager Helper',
                departments: [KC1, KC2],
                agents: [
                    {
                        id: 'g1',
                        slug: 'assistant',
                        name: 'Ассистент',
                        status: { code: 'working', label: 'Работает' },
                        products: [
                            {
                                id: 'p1',
                                slug: 'manager-helper',
                                name: 'Manager Helper',
                                departments: [KC1, KC2],
                            },
                        ],
                        skills: [],
                    },
                ],
            },
            { id: 'p2', slug: 'web', name: 'Веб', departments: [], agents: [] },
        ],
    };
    const actual = json(new CatalogResponse(view));
    if (process.env.UPDATE_CONTRACT === '1') {
        writeFileSync(CATALOG_FILE, `${JSON.stringify(actual, null, 2)}\n`);
    }
    it('portal fixture equals the real backend response', () => {
        expect(existsSync(CATALOG_FILE)).toBe(true);
        expect(JSON.parse(readFileSync(CATALOG_FILE, 'utf8'))).toEqual(actual);
    });
});
