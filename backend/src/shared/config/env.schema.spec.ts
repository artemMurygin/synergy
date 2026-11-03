import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

const REQUIRED_ENV = {
    POSTGRES_URL: 'postgresql://audit:audit@localhost:5432/audit_agent',
    MSSQL_URL: 'sqlserver://localhost:1433;database=master',
};

describe('validateEnv LangSmith settings', () => {
    it('disables tracing by default', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.LANGSMITH_TRACING).toBe(false);
        expect(env.LANGSMITH_PROJECT).toBe('audit-agent');
        expect(env.LANGSMITH_API_KEY).toBeUndefined();
    });

    it('treats empty values from .env as missing', () => {
        const env = validateEnv({
            ...REQUIRED_ENV,
            LANGSMITH_TRACING: '',
            LANGSMITH_API_KEY: '',
            LANGSMITH_ENDPOINT: '',
        });

        expect(env.LANGSMITH_TRACING).toBe(false);
        expect(env.LANGSMITH_ENDPOINT).toBeUndefined();
    });

    it('requires an api key when tracing is enabled', () => {
        expect(() => validateEnv({ ...REQUIRED_ENV, LANGSMITH_TRACING: 'true' })).toThrow(
            'LANGSMITH_API_KEY is required when LANGSMITH_TRACING=true',
        );
    });

    it('accepts enabled tracing with an api key and a custom endpoint', () => {
        const env = validateEnv({
            ...REQUIRED_ENV,
            LANGSMITH_TRACING: 'true',
            LANGSMITH_API_KEY: 'lsv2_test',
            LANGSMITH_ENDPOINT: 'https://eu.api.smith.langchain.com',
        });

        expect(env.LANGSMITH_TRACING).toBe(true);
        expect(env.LANGSMITH_ENDPOINT).toBe('https://eu.api.smith.langchain.com');
    });

    it('rejects an invalid endpoint', () => {
        expect(() => validateEnv({ ...REQUIRED_ENV, LANGSMITH_ENDPOINT: 'not-a-url' })).toThrow(
            'LANGSMITH_ENDPOINT',
        );
    });
});

describe('validateEnv programs ETL settings', () => {
    it('keeps sync disabled when no interval is configured', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.PROGRAMS_SYNC_INTERVAL_MS).toBeUndefined();
        expect(env.PROGRAMS_SYNC_MIN_ROW_RATIO).toBe(0.5);
        expect(env.PROGRAMS_EMBEDDING_BATCH_SIZE).toBe(100);
        expect(env.PROGRAMS_EMBEDDING_MODEL).toBe('text-embedding-3-small');
    });

    it('allows startup with incomplete sync credentials for scheduler to report', () => {
        const env = validateEnv({ ...REQUIRED_ENV, PROGRAMS_SYNC_INTERVAL_MS: '86400000' });

        expect(env.PROGRAMS_SYNC_INTERVAL_MS).toBe(86400000);
        expect(env.GOOGLE_SERVICE_ACCOUNT_JSON).toBeUndefined();
        expect(env.OPENAI_API_KEY).toBeUndefined();
    });

    it('accepts valid sync settings', () => {
        const env = validateEnv({
            ...REQUIRED_ENV,
            PROGRAMS_SYNC_INTERVAL_MS: '86400000',
            PROGRAMS_SYNC_MIN_ROW_RATIO: '0.6',
            PROGRAMS_EMBEDDING_BATCH_SIZE: '50',
            GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"etl@example.com"}',
            OPENAI_API_KEY: 'test-key',
        });

        expect(env.PROGRAMS_SYNC_INTERVAL_MS).toBe(86400000);
        expect(env.PROGRAMS_SYNC_MIN_ROW_RATIO).toBe(0.6);
        expect(env.PROGRAMS_EMBEDDING_BATCH_SIZE).toBe(50);
    });

    it('rejects invalid numeric settings', () => {
        expect(() => validateEnv({ ...REQUIRED_ENV, PROGRAMS_SYNC_MIN_ROW_RATIO: '1.5' })).toThrow(
            'PROGRAMS_SYNC_MIN_ROW_RATIO',
        );
        expect(() => validateEnv({ ...REQUIRED_ENV, PROGRAMS_EMBEDDING_BATCH_SIZE: '0' })).toThrow(
            'PROGRAMS_EMBEDDING_BATCH_SIZE',
        );
    });
});
