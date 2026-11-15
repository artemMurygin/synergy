import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PG_POOL } from '../../database/postgres/database.constants';
import { SeedDirectoryUseCase } from './application/seed-users.use-case';
import { AuthSeedModule } from './auth-seed.module';
import { AUTH_REDIS } from './auth.tokens';

const env: Record<string, string> = {
    POSTGRES_URL: 'postgresql://user:pass@127.0.0.1:1/none',
    MSSQL_URL: 'sqlserver://127.0.0.1:1;database=none',
    JWT_SECRET: 's'.repeat(40),
    LOKI_URL: '',
    NODE_ENV: 'test',
};

describe('AuthSeedModule', () => {
    beforeEach(() => {
        for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('resolves every dependency of the seed use case without the HTTP application', async () => {
        const moduleRef = await Test.createTestingModule({ imports: [AuthSeedModule] })
            .overrideProvider(PG_POOL)
            .useValue({ end: () => Promise.resolve() })
            .overrideProvider(AUTH_REDIS)
            .useValue({ status: 'end', disconnect: () => undefined })
            .compile();

        expect(moduleRef.get(SeedDirectoryUseCase)).toBeInstanceOf(SeedDirectoryUseCase);
        await moduleRef.close();
    });
});
