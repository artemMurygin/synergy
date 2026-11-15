// Initial load of departments and employees. Source: `--file <path>` or AUTH_SEED_FILE (JSON
// {"departments":[...],"users":[...]}, see db/seeds/users.example.json); the legacy AUTH_SEED_USERS
// (JSON array of {"login","password?","roles?"}) still works. Only new records are created, existing
// ones are skipped. Run after `npm run build`. Generated passwords go to stdout once and are never
// written to the application log.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AuthSeedModule } from '../dist/modules/auth/auth-seed.module.js';
import {
    formatSeedReport,
    loadSeedInput,
} from '../dist/modules/auth/application/seed-users.cli.js';
import { SeedDirectoryUseCase } from '../dist/modules/auth/application/seed-users.use-case.js';

try {
    process.loadEnvFile();
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

function fileArgument(args) {
    const inline = args.find((arg) => arg.startsWith('--file='));
    if (inline !== undefined) return inline.slice('--file='.length);
    const index = args.indexOf('--file');
    return index === -1 ? undefined : args[index + 1];
}

let input;
try {
    input = loadSeedInput({
        filePath: fileArgument(process.argv.slice(2)) ?? process.env.AUTH_SEED_FILE,
        legacyUsers: process.env.AUTH_SEED_USERS,
        readFile: (path) => readFileSync(path, 'utf8'),
    });
} catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
}

const app = await NestFactory.createApplicationContext(AuthSeedModule, { logger: false });
try {
    const result = await app.get(SeedDirectoryUseCase).execute(input);
    process.stdout.write(`${formatSeedReport(result)}\n`);
} catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
} finally {
    await app.close();
}
