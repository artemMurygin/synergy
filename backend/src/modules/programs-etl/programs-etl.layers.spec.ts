import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULE_ROOT = __dirname;
const LAYERS = ['domain', 'application', 'infrastructure', 'interface'] as const;
const PURE_LAYERS = ['domain', 'application'] as const;
const FORBIDDEN_IMPORT =
    /from\s+['"](@nestjs\/|bullmq|@langchain\/|langchain|deepagents|googleapis|google-auth-library|slonik|pg|ioredis|@willsoto\/|pino)/;

function listSources(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return listSources(path);
        return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
    });
}

describe('programs-etl module layout', () => {
    it.each(LAYERS)('has the %s layer directory', (layer) => {
        expect(statSync(join(MODULE_ROOT, layer)).isDirectory()).toBe(true);
    });

    it.each(PURE_LAYERS)('%s does not import external SDKs', (layer) => {
        for (const file of listSources(join(MODULE_ROOT, layer))) {
            expect(readFileSync(file, 'utf8'), file).not.toMatch(FORBIDDEN_IMPORT);
        }
    });

    it('domain does not depend on application, infrastructure or interface', () => {
        for (const file of listSources(join(MODULE_ROOT, 'domain'))) {
            expect(readFileSync(file, 'utf8'), file).not.toMatch(
                /from\s+['"](\.\.\/)+(application|infrastructure|interface)/,
            );
        }
    });

    it('application does not depend on infrastructure or interface', () => {
        for (const file of listSources(join(MODULE_ROOT, 'application'))) {
            expect(readFileSync(file, 'utf8'), file).not.toMatch(
                /from\s+['"](\.\.\/)+(infrastructure|interface)/,
            );
        }
    });
});
