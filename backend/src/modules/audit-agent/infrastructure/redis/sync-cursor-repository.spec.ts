import { describe, expect, it, vi } from 'vitest';
import { SyncCursorRepository, SYNC_CURSOR_KEY } from './sync-cursor-repository';

function createClient(initial: string | null): {
    get: ReturnType<typeof vi.fn<(key: string) => Promise<string | null>>>;
    set: ReturnType<typeof vi.fn<(key: string, value: string) => Promise<unknown>>>;
} {
    return {
        get: vi.fn((key: string) => Promise.resolve(key === SYNC_CURSOR_KEY ? initial : null)),
        set: vi.fn((key: string, value: string) => Promise.resolve(`${key}${value}`)),
    };
}

describe('SyncCursorRepository', () => {
    it('returns null when the cursor is empty', async () => {
        const client = createClient(null);
        const store = new SyncCursorRepository(client);

        await expect(store.get()).resolves.toBeNull();
        expect(client.get).toHaveBeenCalledWith(SYNC_CURSOR_KEY);
    });

    it('stores the cursor as an ISO string', async () => {
        const client = createClient(null);
        const store = new SyncCursorRepository(client);

        await store.set(new Date('2026-05-01T10:00:00.000Z'));

        expect(client.set).toHaveBeenCalledWith(SYNC_CURSOR_KEY, '2026-05-01T10:00:00.000Z');
    });

    it('reads back a stored cursor as a date', async () => {
        const client = createClient('2026-05-01T10:00:00.000Z');
        const store = new SyncCursorRepository(client);

        await expect(store.get()).resolves.toEqual(new Date('2026-05-01T10:00:00.000Z'));
    });

    it('treats a corrupted cursor as empty', async () => {
        const client = createClient('not-a-date');
        const store = new SyncCursorRepository(client);

        await expect(store.get()).resolves.toBeNull();
    });
});
