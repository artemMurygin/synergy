import { describe, expect, it, vi } from 'vitest';
import type { StoreGeneratedFileUseCase } from '../../files/application/store-generated-file.use-case';
import { GeneratedDocumentStore } from './generated-document-store';

describe('GeneratedDocumentStore', () => {
    it('stores the document through the files module and returns its view', async () => {
        const view = { id: 'f1' };
        const execute = vi.fn(() => Promise.resolve(view));
        const store = new GeneratedDocumentStore({
            execute,
        } as unknown as StoreGeneratedFileUseCase);
        const input = {
            ownerId: 'me',
            name: 'Поставленные задачи — rec.docx',
            mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            buffer: Buffer.from('x'),
        };

        await expect(store.store(input)).resolves.toBe(view);
        expect(execute).toHaveBeenCalledWith(input);
    });
});
