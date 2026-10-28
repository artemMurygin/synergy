import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError, BaseError, NotFoundError } from '../../../shared/errors';
import { AuditIssue } from './value-objects/audit-issue.value-object';
import { DealAudit } from './aggregates/deal-audit.aggregate';
import { DealId } from './value-objects/deal-id.value-object';
import { DealNotFoundError } from './errors/deal-not-found.error';
import { Deal } from './entities/deal.entity';
import { Employee } from './aggregates/employee.aggregate';
import { PermanentNotifyError, TransientNotifyError } from './errors/notify.errors';

const updatedAt = new Date('2026-01-01T10:00:00Z');

describe('Deal', () => {
    it('is built from a CRM snapshot', () => {
        const deal = Deal.create({
            id: new DealId('7'),
            clientName: 'Ivan',
            phone: null,
            program: 'Law',
            studyForm: 'full-time',
            leadSource: 'site',
            pipelineStage: 'new',
            responsibleId: '15',
            updatedAt,
        });
        expect(deal.dealId.value).toBe('7');
        expect(deal.id).toBe('7');
        expect(deal.phone).toBeNull();
        expect(deal.clientName).toBe('Ivan');
        expect(deal.responsibleId).toBe('15');
        expect(deal.updatedAt).toEqual(updatedAt);
    });
});

describe('DealAudit', () => {
    const issue = new AuditIssue({ field: 'phone', reason: 'missing' });
    const auditedAt = new Date('2026-01-01T11:00:00Z');

    it('creates an ok audit without issues', () => {
        const audit = DealAudit.create({
            id: 'audit-1',
            dealId: new DealId('7'),
            dealUpdatedAt: updatedAt,
            verdict: 'ok',
            issues: [],
            auditedAt,
        });
        expect(audit.verdict).toBe('ok');
        expect(audit.issues).toEqual([]);
        expect(audit.dealId.value).toBe('7');
        expect(audit.dealUpdatedAt).toEqual(updatedAt);
        expect(audit.auditedAt).toEqual(auditedAt);
    });

    it('rejects an ok audit that has issues', () => {
        expect(() =>
            DealAudit.create({
                id: 'audit-1',
                dealId: new DealId('7'),
                dealUpdatedAt: updatedAt,
                verdict: 'ok',
                issues: [issue],
                auditedAt,
            }),
        ).toThrow(ArgumentInvalidError);
    });

    it('keeps issues for a violations audit', () => {
        const audit = DealAudit.create({
            id: 'audit-2',
            dealId: new DealId('7'),
            dealUpdatedAt: updatedAt,
            verdict: 'violations',
            issues: [issue],
            auditedAt,
        });
        expect(audit.issues).toHaveLength(1);
        expect(audit.issues[0]?.field).toBe('phone');
    });

    it('does not expose a mutable issues list', () => {
        const source = [issue];
        const audit = DealAudit.create({
            id: 'audit-3',
            dealId: new DealId('7'),
            dealUpdatedAt: updatedAt,
            verdict: 'violations',
            issues: source,
            auditedAt,
        });
        source.length = 0;
        expect(audit.issues).toHaveLength(1);
        expect(Object.isFrozen(audit.issues)).toBe(true);
    });
});

describe('Employee', () => {
    const baseProps = {
        id: 'e-1',
        crmResponsibleId: '15',
        fullName: 'Ivan Petrov',
        telegramUsername: 'ivan',
        telegramChatId: '1001',
        isActive: true,
    };

    it('exposes its fields', () => {
        const employee = Employee.create(baseProps);
        expect(employee.crmResponsibleId).toBe('15');
        expect(employee.fullName).toBe('Ivan Petrov');
        expect(employee.telegramUsername).toBe('ivan');
        expect(employee.telegramChatId).toBe('1001');
        expect(employee.isActive).toBe(true);
    });

    it('can be notified when active and has a chat id', () => {
        expect(Employee.create(baseProps).canBeNotified()).toBe(true);
    });

    it('cannot be notified when inactive', () => {
        expect(Employee.create({ ...baseProps, isActive: false }).canBeNotified()).toBe(false);
    });

    it('cannot be notified without a chat id', () => {
        expect(Employee.create({ ...baseProps, telegramChatId: null }).canBeNotified()).toBe(false);
    });
});

describe('domain errors', () => {
    it('DealNotFoundError is a not found error mentioning the deal', () => {
        const error = new DealNotFoundError(new DealId('9'));
        expect(error).toBeInstanceOf(NotFoundError);
        expect(error.message).toContain('9');
    });

    it('notify errors are distinguishable', () => {
        const transient = new TransientNotifyError('timeout');
        const permanent = new PermanentNotifyError('blocked');
        expect(transient).toBeInstanceOf(BaseError);
        expect(permanent).toBeInstanceOf(BaseError);
        expect(transient).not.toBeInstanceOf(PermanentNotifyError);
        expect(permanent).not.toBeInstanceOf(TransientNotifyError);
        expect(transient.code).not.toBe(permanent.code);
    });
});
