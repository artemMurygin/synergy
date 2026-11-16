import { describe, expect, it } from 'vitest';
import { SyncCursorRegressionError } from '../errors';
import { SyncedProject } from './synced-project.entity';

describe('SyncedProject', () => {
    it('starts without a sync cursor', () => {
        const syncedProject = SyncedProject.create({ projectId: '1', title: 'Проект' });

        expect(syncedProject.lastSyncedAt).toBeNull();
    });

    it('advances the cursor forward', () => {
        const syncedProject = SyncedProject.create({ projectId: '1', title: 'Проект' });
        const syncedAt = new Date('2026-01-02T00:00:00Z');

        syncedProject.advanceTo(syncedAt);

        expect(syncedProject.lastSyncedAt?.getTime()).toBe(syncedAt.getTime());
    });

    it('allows advancing to the same instant', () => {
        const sameAt = new Date('2026-01-02T00:00:00Z');
        const syncedProject = SyncedProject.create({
            projectId: '1',
            title: 'Проект',
            lastSyncedAt: sameAt,
        });

        syncedProject.advanceTo(sameAt);

        expect(syncedProject.lastSyncedAt?.getTime()).toBe(sameAt.getTime());
    });

    it('rejects advancing the cursor to an earlier instant', () => {
        const syncedProject = SyncedProject.create({
            projectId: '1',
            title: 'Проект',
            lastSyncedAt: new Date('2026-01-02T00:00:00Z'),
        });

        expect(() => {
            syncedProject.advanceTo(new Date('2026-01-01T00:00:00Z'));
        }).toThrow(SyncCursorRegressionError);
        expect(syncedProject.lastSyncedAt?.getTime()).toBe(
            new Date('2026-01-02T00:00:00Z').getTime(),
        );
    });
});
