import { Workbook } from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { UnsupportedMediaTypeError } from '../domain/errors';
import { MediaTypeDetector } from './media-type-detector';

const HEAD_BYTES = 4100;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function xlsxSample(): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.addWorksheet('Лист').addRow([1, 'значение']);
    return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function docxSample(): Promise<Buffer> {
    const zip = new JSZip();
    zip.file(
        '[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
            '</Types>',
    );
    zip.file('word/document.xml', '<w:document/>');
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function withPadding(head: Buffer | number[], size = 64): Buffer {
    const bytes = Buffer.isBuffer(head) ? head : Buffer.from(head);
    return Buffer.concat([bytes, Buffer.alloc(Math.max(0, size - bytes.length))]);
}

const pdfSample = (): Buffer => Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n', 'latin1');

// ID3v2 + заголовок MPEG-кадра.
const mp3Sample = (): Buffer =>
    withPadding([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x90, 0x64]);

function oggOpusSample(): Buffer {
    const page = Buffer.alloc(64);
    page.write('OggS', 0, 'latin1');
    page[5] = 0x02; // первая страница потока
    page[26] = 1; // один сегмент
    page[27] = 19;
    page.write('OpusHead', 28, 'latin1');
    page[36] = 1;
    return page;
}

function wavSample(): Buffer {
    const head = Buffer.alloc(64);
    head.write('RIFF', 0, 'latin1');
    head.writeUInt32LE(56, 4);
    head.write('WAVE', 8, 'latin1');
    head.write('fmt ', 12, 'latin1');
    return head;
}

function ftypSample(brand: string, compatible: string): Buffer {
    const head = Buffer.alloc(64);
    head.writeUInt32BE(24, 0);
    head.write(`ftyp${brand}`, 4, 'latin1');
    head.write(compatible, 16, 'latin1');
    return head;
}

const exeSample = (): Buffer => withPadding(Buffer.from('MZ\x90\x00\x03\x00', 'latin1'));

const cfbSample = (): Buffer => withPadding([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 512);

const head = (file: Buffer): Buffer => file.subarray(0, HEAD_BYTES);

describe('MediaTypeDetector', () => {
    const detector = new MediaTypeDetector();

    async function expectUnsupported(promise: Promise<unknown>): Promise<void> {
        await expect(promise).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
    }

    describe('по сигнатуре', () => {
        it.each<[string, () => Buffer | Promise<Buffer>, string, string, 'document' | 'recording']>(
            [
                ['xlsx', xlsxSample, 'Отчёт.xlsx', XLSX_MIME, 'document'],
                ['docx', docxSample, 'Письмо.docx', DOCX_MIME, 'document'],
                ['pdf', pdfSample, 'scan.pdf', 'application/pdf', 'document'],
                ['mp3', mp3Sample, 'meeting.mp3', 'audio/mpeg', 'recording'],
                ['ogg/opus', oggOpusSample, 'voice.ogg', 'audio/ogg', 'recording'],
                ['wav', wavSample, 'call.wav', 'audio/wav', 'recording'],
                [
                    'm4a',
                    () => ftypSample('M4A ', 'isomM4A '),
                    'memo.m4a',
                    'audio/x-m4a',
                    'recording',
                ],
                ['mp4', () => ftypSample('isom', 'isommp41'), 'zoom.mp4', 'video/mp4', 'recording'],
            ],
        )('распознаёт %s', async (_name, build, fileName, mime, kind) => {
            const type = await detector.detect(head(await build()), fileName);
            expect(type.mime).toBe(mime);
            expect(type.kind).toBe(kind);
        });

        it('определяет тип по содержимому, а не по расширению', async () => {
            const type = await detector.detect(head(pdfSample()), 'renamed.xlsx');
            expect(type.mime).toBe('application/pdf');
        });

        it('исполняемый файл с расширением .xlsx — 415', async () => {
            await expectUnsupported(detector.detect(head(exeSample()), 'data.xlsx'));
        });

        it('zip без признаков Office — 415', async () => {
            const zip = new JSZip();
            zip.file('readme.md', '# hi');
            const archive = await zip.generateAsync({ type: 'nodebuffer' });
            await expectUnsupported(detector.detect(head(archive), 'report.xlsx'));
        });
    });

    describe('текст без сигнатуры', () => {
        it('csv в UTF-8 принимается по расширению', async () => {
            const csv = Buffer.from('ФИО;Телефон\nИванов;+7 900 000-00-00\n', 'utf8');
            const type = await detector.detect(csv, 'list.csv');
            expect(type.mime).toBe('text/csv');
            expect(type.kind).toBe('document');
        });

        it('txt в UTF-8 принимается по расширению, регистр расширения не важен', async () => {
            const txt = Buffer.from('Заметки\tс табом\r\n', 'utf8');
            const type = await detector.detect(txt, 'NOTES.TXT');
            expect(type.mime).toBe('text/plain');
        });

        it('UTF-8 с BOM принимается', async () => {
            const csv = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a;b\n1;2\n')]);
            expect((await detector.detect(csv, 'x.csv')).mime).toBe('text/csv');
        });

        it('многобайтовый символ, обрезанный на границе буфера, не мешает', async () => {
            const text = Buffer.from('я'.repeat(HEAD_BYTES), 'utf8');
            const cut = text.subarray(0, HEAD_BYTES - 1); // последний символ обрезан
            expect((await detector.detect(cut, 'long.txt')).mime).toBe('text/plain');
        });

        it('csv в cp1251 — 415', async () => {
            // «Привет;мир» в cp1251.
            const cp1251 = Buffer.from([
                0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x3b, 0xec, 0xe8, 0xf0, 0x0a,
            ]);
            await expectUnsupported(detector.detect(cp1251, 'list.csv'));
        });

        it('бинарные байты в txt — 415', async () => {
            const binary = Buffer.from([0x68, 0x69, 0x00, 0x01, 0x02, 0x68, 0x69]);
            await expectUnsupported(detector.detect(binary, 'notes.txt'));
        });

        it('текст в UTF-8 с другим расширением — 415', async () => {
            const text = Buffer.from('#!/bin/sh\necho hi\n', 'utf8');
            await expectUnsupported(detector.detect(text, 'script.sh'));
        });

        it('текст без расширения — 415', async () => {
            await expectUnsupported(detector.detect(Buffer.from('a,b\n'), 'list'));
        });

        it('пустой буфер — 415', async () => {
            await expectUnsupported(detector.detect(Buffer.alloc(0), 'empty.txt'));
        });
    });

    describe('cfb (старые xls и doc)', () => {
        it('с расширением .xls — xls', async () => {
            const type = await detector.detect(head(cfbSample()), 'old.XLS');
            expect(type.mime).toBe('application/vnd.ms-excel');
            expect(type.kind).toBe('document');
        });

        it('с расширением .doc — doc', async () => {
            const type = await detector.detect(head(cfbSample()), 'old.doc');
            expect(type.mime).toBe('application/msword');
        });

        it.each(['old.msg', 'old.xlsx', 'old'])('с именем %s — 415', async (fileName) => {
            await expectUnsupported(detector.detect(head(cfbSample()), fileName));
        });
    });
});
