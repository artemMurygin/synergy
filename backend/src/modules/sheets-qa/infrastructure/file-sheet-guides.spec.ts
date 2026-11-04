import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WorkbookError } from '../domain/ports/workbook-reader.port';
import { FileSheetGuides } from './file-sheet-guides';

describe('FileSheetGuides', () => {
    let dir: string;
    let guides: FileSheetGuides;

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'sheet-guides-'));
        await writeFile(join(dir, 'ЦП.md'), '# Структура');
        await mkdir(join(dir, 'ЦП'));
        await writeFile(join(dir, 'ЦП', 'СПО.md'), '# Лист СПО');
        await writeFile(join(dir, 'ЦП', 'МБ ПО.md'), '# Лист МБ ПО');
        guides = new FileSheetGuides(join(dir, 'ЦП.md'), join(dir, 'ЦП'));
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('returns the workbook structure', async () => {
        await expect(guides.index()).resolves.toBe('# Структура');
    });

    it('returns the guide by sheet name ignoring case and a trailing space', async () => {
        await expect(guides.guide('СПО')).resolves.toBe('# Лист СПО');
        await expect(guides.guide('мб по ')).resolves.toBe('# Лист МБ ПО');
    });

    it('does not treat the structure file as a sheet guide', async () => {
        await expect(guides.guide('ЦП')).rejects.toBeInstanceOf(WorkbookError);
    });

    it('lists available guides for an unknown sheet and never leaves the directory', async () => {
        await expect(guides.guide('../secret')).rejects.toThrow('МБ ПО, СПО');
        await expect(guides.guide('')).rejects.toBeInstanceOf(WorkbookError);
    });

    it('reports a missing directory in a way the model can read', async () => {
        const missing = new FileSheetGuides(join(dir, 'нет.md'), join(dir, 'нет'));
        await expect(missing.index()).rejects.toBeInstanceOf(WorkbookError);
        await expect(missing.guide('СПО')).rejects.toBeInstanceOf(WorkbookError);
    });

    it('finds a guide by the alias of a truncated sheet name', async () => {
        await writeFile(join(dir, 'ЦП', 'Реестр ОБЩИЙ.md'), '# Общий реестр');
        const aliased = new FileSheetGuides(join(dir, 'ЦП.md'), join(dir, 'ЦП'), {
            'Реестр ОБЩИЙ с классификацией (': 'Реестр ОБЩИЙ',
        });
        await expect(aliased.guide('Реестр ОБЩИЙ с классификацией (')).resolves.toBe(
            '# Общий реестр',
        );
        await expect(aliased.guide('реестр общий')).resolves.toBe('# Общий реестр');
    });
});
