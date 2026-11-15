import { z } from 'zod';
import { Role } from '../domain/role';
import type { SeedInput, SeedResult } from './seed-users.use-case';

const roleName = z.string().refine((role) => Role.ALL.includes(role as Role), 'Unknown role');

const departmentSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().min(1),
        head: z.string().min(1).optional(),
    })
    .strict();

const employeeSchema = z
    .object({
        login: z.string().min(1),
        lastName: z.string().min(1),
        firstName: z.string().min(1),
        middleName: z.string().optional(),
        departmentId: z.string().optional(),
        position: z.string().optional(),
        email: z.string().optional(),
        scrmEmployeeId: z.string().optional(),
        password: z.string().min(1).optional(),
        roles: z.array(roleName).optional(),
    })
    .strict();

const fileSchema = z
    .object({
        departments: z.array(departmentSchema).default([]),
        users: z.array(employeeSchema),
    })
    .strict();

/** Legacy format (AUTH_SEED_USERS): logins without a profile. */
const legacySchema = z.array(
    z
        .object({
            login: z.string().min(1),
            password: z.string().min(1).optional(),
            roles: z.array(roleName).optional(),
        })
        .strict(),
);

/** Parses the seed file `{departments, users}` or the legacy array of `{login, password?, roles?}`. */
export function parseSeedInput(raw: string): SeedInput {
    const json: unknown = JSON.parse(raw);
    if (Array.isArray(json)) return { departments: [], users: legacySchema.parse(json) };
    return fileSchema.parse(json);
}

export interface LoadSeedInputOptions {
    filePath?: string;
    legacyUsers?: string;
    readFile: (path: string) => string;
}

/** Chooses the source: the file (`AUTH_SEED_FILE`/`--file`) or the legacy `AUTH_SEED_USERS`, never both. */
export function loadSeedInput(options: LoadSeedInputOptions): SeedInput {
    const filePath = options.filePath?.trim() ?? '';
    const legacy = options.legacyUsers?.trim() ?? '';
    if (filePath !== '' && legacy !== '') {
        throw new Error('AUTH_SEED_FILE and AUTH_SEED_USERS are both set: use only one of them');
    }
    if (filePath !== '') {
        let content: string;
        try {
            content = options.readFile(filePath);
        } catch (error) {
            throw new Error(`Cannot read the seed file ${filePath}: ${(error as Error).message}`, {
                cause: error,
            });
        }
        return parseSeedInput(content);
    }
    if (legacy !== '') return parseSeedInput(legacy);
    throw new Error(
        'AUTH_SEED_FILE and AUTH_SEED_USERS are empty: nothing to seed. Set one of them in backend/.env or pass --file.',
    );
}

export function formatSeedReport(result: SeedResult): string {
    const lines: string[] = [];
    for (const id of result.departments.created) lines.push(`department created: ${id}`);
    for (const id of result.departments.skipped) lines.push(`department skipped: ${id}`);
    for (const user of result.users.created) {
        lines.push(
            user.generatedPassword === undefined
                ? `created: ${user.login}`
                : `${user.login}\t${user.generatedPassword}`,
        );
    }
    for (const login of result.users.skipped) lines.push(`skipped: ${login}`);
    return lines.join('\n');
}
