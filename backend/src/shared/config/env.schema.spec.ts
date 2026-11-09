import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

const REQUIRED_ENV = {
    POSTGRES_URL: 'postgresql://audit:audit@localhost:5432/audit_agent',
    MSSQL_URL: 'sqlserver://localhost:1433;database=master',
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
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

describe('validateEnv auth settings', () => {
    const SECRET = 'x'.repeat(32);
    const withAuth = { ...REQUIRED_ENV, JWT_SECRET: SECRET };
    const { JWT_SECRET: _omit, ...WITHOUT_SECRET } = REQUIRED_ENV;

    it('requires JWT_SECRET', () => {
        expect(() => validateEnv(WITHOUT_SECRET)).toThrow('JWT_SECRET');
    });

    it('rejects a JWT_SECRET shorter than 32 characters', () => {
        expect(() => validateEnv({ ...WITHOUT_SECRET, JWT_SECRET: 'x'.repeat(31) })).toThrow(
            'JWT_SECRET',
        );
    });

    it('applies defaults', () => {
        const env = validateEnv(withAuth);

        expect(env.AUTH_ACCESS_TTL).toBe('15m');
        expect(env.AUTH_REFRESH_TTL).toBe('14d');
        expect(env.AUTH_REFRESH_GRACE_SECONDS).toBe(10);
        expect(env.AUTH_LOGIN_MAX_ATTEMPTS).toBe(5);
        expect(env.AUTH_LOGIN_WINDOW_MINUTES).toBe(15);
        expect(env.AUTH_ALLOWED_ORIGINS).toEqual([]);
        expect(env.AUTH_SEED_USERS).toBeUndefined();
    });

    it('parses overrides, origins list and seed users', () => {
        const env = validateEnv({
            ...withAuth,
            AUTH_ACCESS_TTL: '5m',
            AUTH_REFRESH_TTL: '7d',
            AUTH_REFRESH_GRACE_SECONDS: '3',
            AUTH_LOGIN_MAX_ATTEMPTS: '10',
            AUTH_LOGIN_WINDOW_MINUTES: '30',
            AUTH_ALLOWED_ORIGINS: 'chrome-extension://abcdef, http://localhost:5173',
            AUTH_SEED_USERS: '[{"login":"ivan","password":"Temp12345678"}]',
        });

        expect(env.AUTH_ACCESS_TTL).toBe('5m');
        expect(env.AUTH_REFRESH_TTL).toBe('7d');
        expect(env.AUTH_REFRESH_GRACE_SECONDS).toBe(3);
        expect(env.AUTH_LOGIN_MAX_ATTEMPTS).toBe(10);
        expect(env.AUTH_LOGIN_WINDOW_MINUTES).toBe(30);
        expect(env.AUTH_ALLOWED_ORIGINS).toEqual([
            'chrome-extension://abcdef',
            'http://localhost:5173',
        ]);
        expect(env.AUTH_SEED_USERS).toEqual([{ login: 'ivan', password: 'Temp12345678' }]);
    });

    it('rejects invalid TTL, numbers and seed JSON', () => {
        expect(() => validateEnv({ ...withAuth, AUTH_ACCESS_TTL: 'soon' })).toThrow(
            'AUTH_ACCESS_TTL',
        );
        expect(() => validateEnv({ ...withAuth, AUTH_LOGIN_MAX_ATTEMPTS: '0' })).toThrow(
            'AUTH_LOGIN_MAX_ATTEMPTS',
        );
        expect(() => validateEnv({ ...withAuth, AUTH_REFRESH_GRACE_SECONDS: '-1' })).toThrow(
            'AUTH_REFRESH_GRACE_SECONDS',
        );
        expect(() => validateEnv({ ...withAuth, AUTH_SEED_USERS: 'not json' })).toThrow(
            'AUTH_SEED_USERS',
        );
        expect(() => validateEnv({ ...withAuth, AUTH_SEED_USERS: '[{"password":"x"}]' })).toThrow(
            'AUTH_SEED_USERS',
        );
    });

    it('accepts seed users without a password (the seeder generates one)', () => {
        const env = validateEnv({
            ...withAuth,
            AUTH_SEED_USERS: '[{"login":"ivan"},{"login":"petr","password":"Temp12345678"}]',
        });
        expect(env.AUTH_SEED_USERS).toEqual([
            { login: 'ivan' },
            { login: 'petr', password: 'Temp12345678' },
        ]);
    });
});

describe('validateEnv tasks settings', () => {
    it('applies defaults', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.TASKS_STORAGE_DIR).toBe('./storage/tasks');
        expect(env.TASKS_MAX_FILE_SIZE_MB).toBe(20);
        expect(env.TASKS_MAX_FILES_PER_TASK).toBe(10);
    });

    it('coerces numeric overrides', () => {
        const env = validateEnv({
            ...REQUIRED_ENV,
            TASKS_STORAGE_DIR: '/data/tasks',
            TASKS_MAX_FILE_SIZE_MB: '5',
            TASKS_MAX_FILES_PER_TASK: '3',
        });

        expect(env.TASKS_STORAGE_DIR).toBe('/data/tasks');
        expect(env.TASKS_MAX_FILE_SIZE_MB).toBe(5);
        expect(env.TASKS_MAX_FILES_PER_TASK).toBe(3);
    });

    it('rejects invalid values', () => {
        expect(() => validateEnv({ ...REQUIRED_ENV, TASKS_MAX_FILE_SIZE_MB: '0' })).toThrow(
            'TASKS_MAX_FILE_SIZE_MB',
        );
        expect(() => validateEnv({ ...REQUIRED_ENV, TASKS_MAX_FILES_PER_TASK: '-1' })).toThrow(
            'TASKS_MAX_FILES_PER_TASK',
        );
        expect(() => validateEnv({ ...REQUIRED_ENV, TASKS_MAX_FILES_PER_TASK: 'many' })).toThrow(
            'TASKS_MAX_FILES_PER_TASK',
        );
    });
});
