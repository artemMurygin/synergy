import { describe, expect, it, vi } from 'vitest';
import { AuditIssue } from '../../domain/value-objects/audit-issue.value-object';
import { DealAudit } from '../../domain/aggregates/deal-audit.aggregate';
import { DealId } from '../../domain/value-objects/deal-id.value-object';
import { DealAuditRepository } from './deal-audit-repository';
import type { SqlExecutor } from './sql-executor';

const dealUpdatedAt = new Date('2026-05-01T10:00:00.000Z');
const auditedAt = new Date('2026-05-01T10:05:00.000Z');
const auditId = '6f1f2f3e-0000-4000-8000-000000000002';

function createExecutor(row: unknown): {
    executor: SqlExecutor;
    maybeOne: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
} {
    const maybeOne = vi.fn(() => Promise.resolve(row));
    const query = vi.fn(() => Promise.resolve({ rows: [] }));
    return { executor: { maybeOne, query }, maybeOne, query };
}

function firstQuery(mock: ReturnType<typeof vi.fn>): { sql: string; values: readonly unknown[] } {
    const call: unknown = mock.mock.calls[0]?.[0];
    if (typeof call !== 'object' || call === null || !('sql' in call) || !('values' in call)) {
        throw new Error('query was not executed');
    }
    const { sql, values } = call;
    if (typeof sql !== 'string' || !Array.isArray(values)) {
        throw new Error('unexpected query shape');
    }
    return { sql, values };
}

describe('DealAuditRepository', () => {
    it('returns null when the deal version was not audited', async () => {
        const { executor, maybeOne } = createExecutor(null);
        const repository = new DealAuditRepository(executor);

        const audit = await repository.findByVersion(new DealId('deal-1'), dealUpdatedAt);

        expect(audit).toBeNull();
        const { sql, values } = firstQuery(maybeOne);
        expect(sql).toContain('deal_id = $slonik_1');
        expect(sql).toContain('deal_updated_at = $slonik_2');
        expect(values[0]).toBe('deal-1');
    });

    it('restores an audit with issues from a row', async () => {
        const { executor } = createExecutor({
            id: auditId,
            deal_id: 'deal-1',
            deal_updated_at: dealUpdatedAt.getTime(),
            verdict: 'violations',
            issues: [{ field: 'phone', reason: 'Phone is missing' }],
            audited_at: auditedAt.getTime(),
        });
        const repository = new DealAuditRepository(executor);

        const audit = await repository.findByVersion(new DealId('deal-1'), dealUpdatedAt);

        expect(audit?.id).toBe(auditId);
        expect(audit?.dealId.value).toBe('deal-1');
        expect(audit?.dealUpdatedAt).toEqual(dealUpdatedAt);
        expect(audit?.verdict).toBe('violations');
        expect(audit?.issues.map((issue) => issue.field)).toEqual(['phone']);
        expect(audit?.auditedAt).toEqual(auditedAt);
    });

    it('saves an audit idempotently per deal version', async () => {
        const { executor, query } = createExecutor(null);
        const repository = new DealAuditRepository(executor);
        const audit = DealAudit.create({
            id: auditId,
            dealId: new DealId('deal-1'),
            dealUpdatedAt,
            verdict: 'violations',
            issues: [new AuditIssue({ field: 'phone', reason: 'Phone is missing' })],
            auditedAt,
        });

        await repository.save(audit);

        const { sql, values } = firstQuery(query);
        expect(sql).toContain('INSERT INTO deal_audit');
        expect(sql).toContain('ON CONFLICT (deal_id, deal_updated_at) DO NOTHING');
        expect(values).toContain(auditId);
        expect(values).toContain('deal-1');
        expect(values).toContain('violations');
    });
});
