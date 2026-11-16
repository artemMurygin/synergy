import { describe, expect, it } from 'vitest';
import { changeBugStatusSchema, bugQueueQuerySchema, reportBugSchema } from './bugs.schemas';

const UUID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const valid = { title: 'Падает', description: 'Описание', productId: UUID, agentId: UUID };

describe('reportBugSchema', () => {
    it('accepts a valid body and keeps raw text (trim is up to value objects)', () => {
        expect(reportBugSchema.parse({ ...valid, title: ' Падает ' }).title).toBe(' Падает ');
    });

    it('rejects too long raw input and empty or missing ids (id format is checked by the use case, not here)', () => {
        expect(reportBugSchema.safeParse({ ...valid, title: 'a'.repeat(1001) }).success).toBe(
            false,
        );
        expect(
            reportBugSchema.safeParse({ ...valid, description: 'a'.repeat(20001) }).success,
        ).toBe(false);
        expect(reportBugSchema.safeParse({ ...valid, productId: '' }).success).toBe(false);
        expect(reportBugSchema.safeParse({ ...valid, productId: 'x' }).success).toBe(true);
        expect(reportBugSchema.safeParse({ ...valid, agentId: undefined }).success).toBe(false);
    });
});

describe('changeBugStatusSchema', () => {
    it('accepts status with optional reason', () => {
        expect(changeBugStatusSchema.parse({ status: 'wont_fix', reason: 'дубль' })).toEqual({
            status: 'wont_fix',
            reason: 'дубль',
        });
        expect(changeBugStatusSchema.safeParse({ status: 'resolved' }).success).toBe(true);
    });

    it('rejects unknown status and too long reason', () => {
        expect(changeBugStatusSchema.safeParse({ status: 'closed' }).success).toBe(false);
        expect(
            changeBugStatusSchema.safeParse({ status: 'wont_fix', reason: 'a'.repeat(10001) })
                .success,
        ).toBe(false);
    });
});

describe('bugQueueQuerySchema', () => {
    it('allows no filter and a valid filter with paging defaults', () => {
        expect(bugQueueQuerySchema.parse({})).toEqual({ limit: 20, page: 0 });
        expect(bugQueueQuerySchema.parse({ status: 'resolved', page: '1' }).status).toBe(
            'resolved',
        );
    });

    it('rejects an invalid filter', () => {
        expect(bugQueueQuerySchema.safeParse({ status: 'all' }).success).toBe(false);
    });
});
