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
