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

describe('validateEnv OPENAI_BASE_URL and Google key file', () => {
    it('leaves both undefined by default', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.OPENAI_BASE_URL).toBeUndefined();
        expect(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE).toBeUndefined();
    });

    it('accepts a base URL and a key file path', () => {
        const env = validateEnv({
            ...REQUIRED_ENV,
            OPENAI_BASE_URL: 'http://localhost:20128/v1',
            GOOGLE_SERVICE_ACCOUNT_KEY_FILE: '/keys/sa.json',
        });

        expect(env.OPENAI_BASE_URL).toBe('http://localhost:20128/v1');
        expect(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE).toBe('/keys/sa.json');
    });

    it('rejects an invalid base URL', () => {
        expect(() => validateEnv({ ...REQUIRED_ENV, OPENAI_BASE_URL: 'not a url' })).toThrow();
    });
});

describe('validateEnv programs-etl settings', () => {
    it('keeps the scheduler disabled and applies defaults', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.PROGRAMS_ETL_SCHEDULER_ENABLED).toBe(false);
        expect(env.PROGRAMS_ETL_SCAN_CRON).toBe('0 * * * *');
        expect(env.PROGRAMS_ETL_CONCURRENCY).toBe(1);
        expect(env.PROGRAMS_ETL_ATTEMPTS).toBe(3);
        expect(env.PROGRAMS_ETL_BACKOFF_MS).toBe(5000);
        expect(env.PROGRAMS_ETL_OPENAI_MODEL).toBe('gpt-4o');
        expect(env.PROGRAMS_ETL_AGENT_MAX_STEPS).toBe(40);
        expect(env.PROGRAMS_ETL_AGENT_TIMEOUT_MS).toBe(600000);
        expect(env.PROGRAMS_ETL_SHEETS_MAX_CELLS).toBe(400);
    });

    it('parses explicit values', () => {
        const env = validateEnv({
            ...REQUIRED_ENV,
            OPENAI_API_KEY: 'sk-test',
            PROGRAMS_ETL_SCHEDULER_ENABLED: 'true',
            PROGRAMS_ETL_SCAN_CRON: '*/30 * * * *',
            PROGRAMS_ETL_CONCURRENCY: '2',
            PROGRAMS_ETL_SHEETS_MAX_CELLS: '500',
        });

        expect(env.PROGRAMS_ETL_SCHEDULER_ENABLED).toBe(true);
        expect(env.PROGRAMS_ETL_SCAN_CRON).toBe('*/30 * * * *');
        expect(env.PROGRAMS_ETL_CONCURRENCY).toBe(2);
        expect(env.PROGRAMS_ETL_SHEETS_MAX_CELLS).toBe(500);
    });

    it('requires an OpenAI api key when the scheduler is enabled', () => {
        expect(() =>
            validateEnv({ ...REQUIRED_ENV, PROGRAMS_ETL_SCHEDULER_ENABLED: 'true' }),
        ).toThrow('OPENAI_API_KEY is required when PROGRAMS_ETL_SCHEDULER_ENABLED=true');
    });

    it('rejects non-positive limits', () => {
        expect(() => validateEnv({ ...REQUIRED_ENV, PROGRAMS_ETL_CONCURRENCY: '0' })).toThrow(
            'PROGRAMS_ETL_CONCURRENCY',
        );
        expect(() => validateEnv({ ...REQUIRED_ENV, PROGRAMS_ETL_SHEETS_MAX_CELLS: '0' })).toThrow(
            'PROGRAMS_ETL_SHEETS_MAX_CELLS',
        );
    });
});
