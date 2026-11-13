import { z } from 'zod';
import { Role } from '../domain/role';
import type { SeedEntry, SeedResult } from './seed-users.use-case';

const seedSchema = z.array(
    z.object({
        login: z.string().min(1),
        password: z.string().min(1).optional(),
        roles: z
            .array(z.string().refine((role) => Role.ALL.includes(role as Role), 'Unknown role'))
            .optional(),
    }),
);

export function parseSeedUsers(raw: string | undefined): SeedEntry[] {
    if (raw === undefined || raw.trim() === '') return [];
    return seedSchema.parse(JSON.parse(raw));
}

export function formatSeedReport(result: SeedResult): string {
    const lines: string[] = [];
    for (const user of result.created) {
        lines.push(
            user.generatedPassword === undefined
                ? `created: ${user.login}`
                : `${user.login}\t${user.generatedPassword}`,
        );
    }
    for (const login of result.skipped) lines.push(`skipped: ${login}`);
    return lines.join('\n');
}
