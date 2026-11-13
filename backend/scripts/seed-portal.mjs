// Idempotently creates the Featurer portal catalog (products and agents). Run after `npm run build`.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SeedPortalCatalogUseCase } from '../dist/modules/portal/application/seed-portal-catalog.use-case.js';
import { runSeedPortal } from '../dist/modules/portal/application/seed-portal.cli.js';
import { PortalSeedModule } from '../dist/modules/portal/portal-seed.module.js';

try {
    process.loadEnvFile();
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

let app;
let code = 1;
try {
    app = await NestFactory.createApplicationContext(PortalSeedModule, { logger: false });
    code = await runSeedPortal(app.get(SeedPortalCatalogUseCase), {
        stdout: (text) => process.stdout.write(text),
        stderr: (text) => process.stderr.write(text),
    });
} catch (error) {
    process.stderr.write(`seed:portal failed: ${error instanceof Error ? error.message : String(error)}\n`);
} finally {
    await app?.close();
}
process.exit(code);
