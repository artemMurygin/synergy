import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AuditIssue } from '../../domain/value-objects/audit-issue.value-object';
import { type AuditMetricsPort } from '../../domain/ports/audit-metrics.port';
import { type CrmGatewayPort } from '../../domain/ports/crm-gateway.port';
import { DealAudit } from '../../domain/aggregates/deal-audit.aggregate';
import { type DealAuditRepositoryPort } from '../../domain/ports/deal-audit-repository.port';
import { type DealAuditorPort } from '../../domain/ports/deal-auditor.port';
import { DealId } from '../../domain/value-objects/deal-id.value-object';
import { DealNotFoundError } from '../../domain/errors/deal-not-found.error';
import { Deal } from '../../domain/entities/deal.entity';
import { AuditDealUseCase } from './audit-deal.use-case';

const now = new Date('2026-01-02T10:00:00.000Z');
const updatedAt = new Date('2026-01-01T09:00:00.000Z');
const dealId = new DealId('42');

function createDeal(): Deal {
    return Deal.create({
        id: dealId,
        updatedAt,
        clientName: 'Ivan',
        phone: '+79990000000',
        program: 'MBA',
        studyForm: 'online',
        leadSource: 'site',
        pipelineStage: 'new',
        responsibleId: '7',
    });
}

function createFixture(): {
    crm: { getDeal: ReturnType<typeof vi.fn<CrmGatewayPort['getDeal']>> };
    repository: {
        findByVersion: ReturnType<typeof vi.fn<DealAuditRepositoryPort['findByVersion']>>;
        save: ReturnType<typeof vi.fn<DealAuditRepositoryPort['save']>>;
    };
    auditor: { audit: ReturnType<typeof vi.fn<DealAuditorPort['audit']>> };
    metrics: { recordAudit: ReturnType<typeof vi.fn> };
    useCase: AuditDealUseCase;
} {
    const crm = { getDeal: vi.fn<CrmGatewayPort['getDeal']>().mockResolvedValue(createDeal()) };
    const repository = {
        findByVersion: vi.fn<DealAuditRepositoryPort['findByVersion']>().mockResolvedValue(null),
        save: vi.fn<DealAuditRepositoryPort['save']>().mockResolvedValue(undefined),
    };
    const auditor = { audit: vi.fn<DealAuditorPort['audit']>().mockResolvedValue([]) };
    const metrics = { recordAudit: vi.fn() };
    const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const useCase = new AuditDealUseCase(
        crm as unknown as CrmGatewayPort,
        repository,
        auditor,
        logger as unknown as PinoLogger,
        metrics as unknown as AuditMetricsPort,
    );
    return { crm, repository, auditor, metrics, useCase };
}

describe('AuditDealUseCase', () => {
    it('returns skipped without saving when the deal is not found', async () => {
        const { crm, repository, auditor, metrics, useCase } = createFixture();
        crm.getDeal.mockRejectedValue(new DealNotFoundError(dealId));

        const result = await useCase.execute(dealId, now);

        expect(metrics.recordAudit).toHaveBeenCalledWith('skipped');
        expect(result).toEqual({ status: 'skipped', reason: 'deal not found' });
        expect(auditor.audit).not.toHaveBeenCalled();
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('does not audit again when the deal version is already audited', async () => {
        const { repository, auditor, useCase } = createFixture();
        repository.findByVersion.mockResolvedValue(
            DealAudit.create({
                id: 'a1',
                dealId,
                dealUpdatedAt: updatedAt,
                verdict: 'ok',
                issues: [],
                auditedAt: now,
            }),
        );

        const result = await useCase.execute(dealId, now);

        expect(result).toEqual({ status: 'already-audited' });
        expect(repository.findByVersion).toHaveBeenCalledWith(dealId, updatedAt);
        expect(auditor.audit).not.toHaveBeenCalled();
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('saves verdict ok without issues', async () => {
        const { repository, auditor, metrics, useCase } = createFixture();

        const result = await useCase.execute(dealId, now);

        expect(result).toEqual({ status: 'audited', verdict: 'ok' });
        expect(metrics.recordAudit).toHaveBeenCalledWith('ok');
        expect(auditor.audit).toHaveBeenCalledWith(expect.any(Deal));
        const saved = repository.save.mock.calls[0][0];
        expect(saved.verdict).toBe('ok');
        expect(saved.issues).toEqual([]);
        expect(saved.dealUpdatedAt).toEqual(updatedAt);
        expect(saved.auditedAt).toEqual(now);
    });

    it('saves violations with issues', async () => {
        const { repository, auditor, useCase } = createFixture();
        const issue = new AuditIssue({ field: 'phone', reason: 'not a phone' });
        auditor.audit.mockResolvedValue([issue]);

        const result = await useCase.execute(dealId, now);

        expect(result).toEqual({ status: 'audited', verdict: 'violations' });
        const saved = repository.save.mock.calls[0][0];
        expect(saved.verdict).toBe('violations');
        expect(saved.issues).toEqual([issue]);
    });

    it('rethrows a transient CRM failure', async () => {
        const { crm, useCase } = createFixture();
        crm.getDeal.mockRejectedValue(new Error('crm down'));

        await expect(useCase.execute(dealId, now)).rejects.toThrow('crm down');
    });

    it('rethrows an LLM failure without saving', async () => {
        const { repository, auditor, useCase } = createFixture();
        auditor.audit.mockRejectedValue(new Error('llm down'));

        await expect(useCase.execute(dealId, now)).rejects.toThrow('llm down');
        expect(repository.save).not.toHaveBeenCalled();
    });
});
