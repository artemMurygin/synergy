import { z } from 'zod';
import { AUDIT_VERDICTS } from '../../domain/value-objects/audit-verdict';
import { REQUIRED_FIELDS } from '../../domain/value-objects/required-field';

export const auditResultSchema = z.object({
    verdict: z.enum(AUDIT_VERDICTS),
    issues: z.array(
        z.object({
            field: z.enum(REQUIRED_FIELDS),
            reason: z.string().trim().min(1),
        }),
    ),
});
