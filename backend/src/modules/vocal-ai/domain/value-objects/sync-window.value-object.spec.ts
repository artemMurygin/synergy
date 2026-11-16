import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../../shared/errors';
import { SyncWindow } from './sync-window.value-object';

describe('SyncWindow', () => {
    it('accepts fromAt before toAt', () => {
        const fromAt = new Date('2026-01-01T00:00:00Z');
        const toAt = new Date('2026-01-02T00:00:00Z');

        const syncWindow = new SyncWindow({ fromAt, toAt });

        expect(syncWindow.fromAt.getTime()).toBe(fromAt.getTime());
        expect(syncWindow.toAt.getTime()).toBe(toAt.getTime());
    });

    it('rejects equal boundaries', () => {
        const sameAt = new Date('2026-01-01T00:00:00Z');

        expect(() => new SyncWindow({ fromAt: sameAt, toAt: sameAt })).toThrow(
            ArgumentInvalidError,
        );
    });

    it('rejects reversed boundaries', () => {
        const fromAt = new Date('2026-01-02T00:00:00Z');
        const toAt = new Date('2026-01-01T00:00:00Z');

        expect(() => new SyncWindow({ fromAt, toAt })).toThrow(ArgumentInvalidError);
    });
});
