// Creates users from AUTH_SEED_USERS (JSON: [{"login","password?"}]). Run after `npm run build`.
// Generated passwords go to stdout once and are never written to the application log.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AuthSeedModule } from '../dist/modules/auth/auth-seed.module.js';
import {
    formatSeedReport,
    parseSeedUsers,
} from '../dist/modules/auth/application/seed-users.cli.js';
import { SeedUsersUseCase } from '../dist/modules/auth/application/seed-users.use-case.js';

try {
    process.loadEnvFile();
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

if (!process.env.AUTH_SEED_USERS?.trim()) {
    process.stderr.write('AUTH_SEED_USERS is empty: nothing to seed. Set it in backend/.env or in the command.\n');
    process.exit(1);
}

const entries = parseSeedUsers(process.env.AUTH_SEED_USERS);
const app = await NestFactory.createApplicationContext(AuthSeedModule, { logger: false });
try {
    const result = await app.get(SeedUsersUseCase).execute(entries);
    process.stdout.write(`${formatSeedReport(result)}\n`);
} finally {
    await app.close();
}
