import { ArgumentInvalidError } from '../../../../shared/errors';

export const AUDIT_VERDICTS = ['ok', 'violations', 'skipped'] as const;

export type AuditVerdict = (typeof AUDIT_VERDICTS)[number];

export function parseAuditVerdict(value: string): AuditVerdict {
    const verdict = AUDIT_VERDICTS.find((candidate) => candidate === value);
    if (verdict === undefined) {
        throw new ArgumentInvalidError(`Unknown audit verdict: ${value}`);
    }
    return verdict;
}
