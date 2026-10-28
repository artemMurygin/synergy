import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError, ArgumentNotProvidedError } from '../../../../shared/errors';
import { AuditIssue } from './audit-issue.value-object';
import { parseAuditVerdict, type AuditVerdict } from './audit-verdict';
import { DealId } from './deal-id.value-object';
import { NotificationJob } from './notification-job.value-object';
import { parseRequiredField, REQUIRED_FIELDS } from './required-field';
import { SyncWindow } from './sync-window.value-object';

describe('DealId', () => {
    it('exposes the wrapped value', () => {
        expect(new DealId('42').value).toBe('42');
    });

    it('rejects an empty value', () => {
        expect(() => new DealId('')).toThrow(ArgumentNotProvidedError);
    });

    it('rejects a blank value', () => {
        expect(() => new DealId('   ')).toThrow(ArgumentInvalidError);
    });

    it('compares by value', () => {
        expect(new DealId('1').equals(new DealId('1'))).toBe(true);
        expect(new DealId('1').equals(new DealId('2'))).toBe(false);
    });

    it('is immutable', () => {
        const dealId = new DealId('1');
        expect(() => {
            Object.assign(dealId, { value: '2' });
        }).toThrow();
        expect(dealId.value).toBe('1');
    });
});

describe('RequiredField', () => {
    it('contains the closed list of required fields', () => {
        expect(REQUIRED_FIELDS).toEqual([
            'clientName',
            'phone',
            'program',
            'studyForm',
            'leadSource',
            'pipelineStage',
        ]);
    });

    it('parses a known field', () => {
        expect(parseRequiredField('phone')).toBe('phone');
    });

    it('rejects an unknown field', () => {
        expect(() => parseRequiredField('email')).toThrow(ArgumentInvalidError);
    });
});

describe('AuditVerdict', () => {
    it.each(['ok', 'violations', 'skipped'] satisfies AuditVerdict[])('parses %s', (verdict) => {
        expect(parseAuditVerdict(verdict)).toBe(verdict);
    });

    it('rejects an unknown verdict', () => {
        expect(() => parseAuditVerdict('maybe')).toThrow(ArgumentInvalidError);
    });
});

describe('AuditIssue', () => {
    it('keeps field and reason', () => {
        const issue = new AuditIssue({ field: 'phone', reason: 'missing' });
        expect(issue.field).toBe('phone');
        expect(issue.reason).toBe('missing');
    });

    it('rejects an empty reason', () => {
        expect(() => new AuditIssue({ field: 'phone', reason: '' })).toThrow(ArgumentInvalidError);
    });

    it('rejects a field outside the closed list', () => {
        expect(() => new AuditIssue({ field: 'email', reason: 'missing' })).toThrow(
            ArgumentInvalidError,
        );
    });

    it('compares by content', () => {
        const first = new AuditIssue({ field: 'phone', reason: 'missing' });
        const second = new AuditIssue({ field: 'phone', reason: 'missing' });
        const third = new AuditIssue({ field: 'program', reason: 'missing' });
        expect(first.equals(second)).toBe(true);
        expect(first.equals(third)).toBe(false);
    });

    it('is immutable', () => {
        const issue = new AuditIssue({ field: 'phone', reason: 'missing' });
        expect(() => {
            Object.assign(issue, { field: 'program' });
        }).toThrow();
        expect(issue.field).toBe('phone');
    });
});

describe('NotificationJob', () => {
    it('keeps username and message', () => {
        const job = new NotificationJob({ username: 'ivan', message: 'fix deal' });
        expect(job.username).toBe('ivan');
        expect(job.message).toBe('fix deal');
    });

    it('rejects an empty username', () => {
        expect(() => new NotificationJob({ username: '', message: 'text' })).toThrow(
            ArgumentInvalidError,
        );
    });

    it('rejects an empty message', () => {
        expect(() => new NotificationJob({ username: 'ivan', message: '' })).toThrow(
            ArgumentInvalidError,
        );
    });

    it('is immutable', () => {
        const job = new NotificationJob({ username: 'ivan', message: 'text' });
        expect(() => {
            Object.assign(job, { username: 'petr' });
        }).toThrow();
        expect(job.username).toBe('ivan');
    });
});

describe('SyncWindow', () => {
    const earlier = new Date('2026-01-01T00:00:00Z');
    const later = new Date('2026-01-02T00:00:00Z');

    it('accepts from before to', () => {
        const window = new SyncWindow({ from: earlier, to: later });
        expect(window.from).toEqual(earlier);
        expect(window.to).toEqual(later);
    });

    it('accepts from equal to to', () => {
        expect(() => new SyncWindow({ from: earlier, to: earlier })).not.toThrow();
    });

    it('rejects from after to', () => {
        expect(() => new SyncWindow({ from: later, to: earlier })).toThrow(ArgumentInvalidError);
    });

    it('rejects invalid dates', () => {
        expect(() => new SyncWindow({ from: new Date('nope'), to: later })).toThrow(
            ArgumentInvalidError,
        );
    });

    it('is immutable', () => {
        const window = new SyncWindow({ from: earlier, to: later });
        expect(() => {
            Object.assign(window, { from: later });
        }).toThrow();
        expect(window.from).toEqual(earlier);
    });
});
