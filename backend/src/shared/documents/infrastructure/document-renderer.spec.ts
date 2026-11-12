import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { DocumentModel } from '../document-model';
import { DocumentRenderer } from './document-renderer';

const EMPTY_CELL = '—';

async function unzip(buffer: Buffer): Promise<JSZip> {
    return JSZip.loadAsync(buffer);
}

async function documentXml(buffer: Buffer): Promise<string> {
    const file = (await unzip(buffer)).file('word/document.xml');
    if (file === null) throw new Error('word/document.xml is missing');
    return file.async('string');
}

/** Текст всех `<w:t>` по порядку: так проверяется содержание без разметки. */
function texts(xml: string): string[] {
    return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]);
}

describe('DocumentRenderer', () => {
    const renderer = new DocumentRenderer();

    const doc = DocumentModel.of({
        title: 'Расшифровка — Планёрка',
        blocks: [
            { kind: 'heading', text: 'Участники' },
            { kind: 'paragraph', text: 'Анна, Спикер 2' },
            {
                kind: 'paragraph',
                runs: [
                    { text: '[00:00:05] ' },
                    { text: 'Анна', bold: true },
                    { text: ': Начнём.' },
                ],
            },
            {
                kind: 'table',
                header: ['№', 'Задача', 'Срок'],
                rows: [
                    ['1', 'Подготовить отчёт', null],
                    ['2', 'Созвониться с ёжиком', '  '],
                ],
            },
        ],
    });

    it('produces a valid zip with [Content_Types].xml', async () => {
        const buffer = await renderer.render(doc);
        const zip = await unzip(buffer);

        expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
        expect(zip.file('[Content_Types].xml')).not.toBeNull();
        expect(zip.file('word/document.xml')).not.toBeNull();
    });

    it('puts the title, heading, paragraphs and table into word/document.xml', async () => {
        const all = texts(await documentXml(await renderer.render(doc)));

        expect(all).toContain('Расшифровка — Планёрка');
        expect(all).toContain('Участники');
        expect(all).toContain('Анна, Спикер 2');
        expect(all.join('')).toContain('[00:00:05] Анна: Начнём.');
        expect(all).toEqual(expect.arrayContaining(['№', 'Задача', 'Срок', 'Подготовить отчёт']));
        expect(await documentXml(await renderer.render(doc))).toContain('<w:tbl>');
    });

    it('keeps Cyrillic text intact', async () => {
        const all = texts(await documentXml(await renderer.render(doc)));

        expect(all).toContain('Созвониться с ёжиком');
    });

    it('renders an empty or blank cell as a dash', async () => {
        const all = texts(await documentXml(await renderer.render(doc)));
        const dashes = all.filter((t) => t === EMPTY_CELL);

        expect(dashes).toHaveLength(2);
    });
});
