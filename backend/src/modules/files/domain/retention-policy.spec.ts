import { describe, expect, it } from 'vitest';
import { InvalidRetentionError, Retention } from './retention';
import { RetentionPolicy } from './retention-policy';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-03-01T09:00:00.000Z');
const policy = new RetentionPolicy({ documentDays: 30, recordingDays: 1, maxHoldDays: 7 });

describe('RetentionPolicy', () => {
    it('keeps a document for 30 days from upload', () => {
        const retention = policy.initial('document', now);

        expect(retention.expiresAt).toEqual(new Date('2026-03-31T09:00:00.000Z'));
        expect(retention.heldUntil).toBeNull();
    });

    it('holds a recording for 7 days without an expiry', () => {
        const retention = policy.initial('recording', now);

        expect(retention.heldUntil).toEqual(new Date(now.getTime() + 7 * DAY));
        expect(retention.expiresAt).toBeNull();
        expect(retention.isHeld()).toBe(true);
    });

    it('expires a released recording one day after release', () => {
        const releasedAt = new Date('2026-03-02T12:00:00.000Z');
        const retention = policy.released(releasedAt);

        expect(retention.expiresAt).toEqual(new Date('2026-03-03T12:00:00.000Z'));
        expect(retention.heldUntil).toBeNull();
    });

    it('holds again for the maximum hold', () => {
        expect(policy.held(now).heldUntil).toEqual(new Date(now.getTime() + 7 * DAY));
    });

    it('counts a stale hold as released at its end', () => {
        const retention = policy.initial('recording', now);

        expect(policy.effectiveExpiry(retention)).toEqual(new Date(now.getTime() + 8 * DAY));
        expect(policy.effectiveExpiry(policy.initial('document', now))).toEqual(
            new Date(now.getTime() + 30 * DAY),
        );
    });

    it.each([
        ['documentDays', { documentDays: 0, recordingDays: 1, maxHoldDays: 7 }],
        ['recordingDays', { documentDays: 30, recordingDays: -1, maxHoldDays: 7 }],
        ['maxHoldDays', { documentDays: 30, recordingDays: 1, maxHoldDays: Number.NaN }],
    ])('rejects a non-positive %s', (_name, settings) => {
        expect(() => new RetentionPolicy(settings)).toThrow();
    });
});

describe('Retention', () => {
    it('requires exactly one of heldUntil and expiresAt', () => {
        expect(() => Retention.of({ heldUntil: null, expiresAt: null })).toThrow(
            InvalidRetentionError,
        );
        expect(() => Retention.of({ heldUntil: now, expiresAt: now })).toThrow(
            InvalidRetentionError,
        );
    });

    it('is immutable and compared by value', () => {
        const a = Retention.expiring(now);
        const b = Retention.expiring(new Date(now.getTime()));

        expect(a.equals(b)).toBe(true);
        expect(a.equals(Retention.heldUntil(now))).toBe(false);
        expect(Object.isFrozen(a)).toBe(true);
    });
});
