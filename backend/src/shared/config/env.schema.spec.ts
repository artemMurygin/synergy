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

    it('keeps the optional roles field of AUTH_SEED_USERS entries', () => {
        const env = validateEnv({
            ...withAuth,
            AUTH_SEED_USERS: '[{"login":"dev","roles":["developer"]}]',
        });

        expect(env.AUTH_SEED_USERS).toEqual([{ login: 'dev', roles: ['developer'] }]);
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

    it('keeps AUTH_SEED_FILE optional and accepts a path', () => {
        expect(validateEnv({ ...withAuth }).AUTH_SEED_FILE).toBeUndefined();
        expect(
            validateEnv({ ...withAuth, AUTH_SEED_FILE: './db/seeds/users.json' }).AUTH_SEED_FILE,
        ).toBe('./db/seeds/users.json');
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

describe('validateEnv outbox and notifications settings', () => {
    it('applies defaults', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.OUTBOX_POLL_INTERVAL_MS).toBe(1000);
        expect(env.OUTBOX_BATCH_SIZE).toBe(50);
        expect(env.OUTBOX_MAX_ATTEMPTS).toBe(10);
        expect(env.OUTBOX_RETENTION_DAYS).toBe(7);
        expect(env.NOTIFICATIONS_WS_PING_INTERVAL_MS).toBe(20000);
    });

    it('coerces numeric overrides', () => {
        const env = validateEnv({
            ...REQUIRED_ENV,
            OUTBOX_POLL_INTERVAL_MS: '250',
            OUTBOX_BATCH_SIZE: '10',
            OUTBOX_MAX_ATTEMPTS: '3',
            OUTBOX_RETENTION_DAYS: '30',
            NOTIFICATIONS_WS_PING_INTERVAL_MS: '5000',
        });

        expect(env.OUTBOX_POLL_INTERVAL_MS).toBe(250);
        expect(env.OUTBOX_BATCH_SIZE).toBe(10);
        expect(env.OUTBOX_MAX_ATTEMPTS).toBe(3);
        expect(env.OUTBOX_RETENTION_DAYS).toBe(30);
        expect(env.NOTIFICATIONS_WS_PING_INTERVAL_MS).toBe(5000);
    });

    it.each([
        ['OUTBOX_POLL_INTERVAL_MS', '0'],
        ['OUTBOX_POLL_INTERVAL_MS', 'often'],
        ['OUTBOX_BATCH_SIZE', '-5'],
        ['OUTBOX_BATCH_SIZE', '1.5'],
        ['OUTBOX_MAX_ATTEMPTS', '0'],
        ['OUTBOX_RETENTION_DAYS', '0'],
        ['NOTIFICATIONS_WS_PING_INTERVAL_MS', '-1'],
        ['NOTIFICATIONS_WS_PING_INTERVAL_MS', 'fast'],
        ['NOTIFICATIONS_WS_PING_INTERVAL_MS', '25001'],
    ])('rejects %s=%s', (name, value) => {
        expect(() => validateEnv({ ...REQUIRED_ENV, [name]: value })).toThrow(name);
    });
});

describe('validateEnv telegram settings', () => {
    const BOT_TOKEN = '123456:telegram-bot-token-secret-value';
    const WEBHOOK_SECRET = 's'.repeat(32);
    const WEBHOOK_ENV = {
        ...REQUIRED_ENV,
        TELEGRAM_BOT_TOKEN: BOT_TOKEN,
        TELEGRAM_BOT_USERNAME: 'synergy_helper_bot',
        TELEGRAM_UPDATES_MODE: 'webhook',
        TELEGRAM_WEBHOOK_URL: 'https://api.example.com/telegram/webhook',
        TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    };

    const errorText = (raw: Record<string, unknown>): string => {
        try {
            validateEnv(raw);
        } catch (error: unknown) {
            return error instanceof Error ? error.message : String(error);
        }
        throw new Error('validateEnv was expected to throw');
    };

    it('applies defaults', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
        expect(env.TELEGRAM_BOT_USERNAME).toBeUndefined();
        expect(env.TELEGRAM_UPDATES_MODE).toBe('off');
        expect(env.TELEGRAM_WEBHOOK_URL).toBeUndefined();
        expect(env.TELEGRAM_WEBHOOK_SECRET).toBeUndefined();
        expect(env.TELEGRAM_LINK_TOKEN_TTL_SECONDS).toBe(600);
        expect(env.TELEGRAM_DELIVERY_RESERVATION_MS).toBe(120000);
        expect(env.TELEGRAM_API_BASE_URL).toBe('https://api.telegram.org');
    });

    it('treats empty telegram values from .env as missing', () => {
        const env = validateEnv({
            ...REQUIRED_ENV,
            TELEGRAM_BOT_TOKEN: '',
            TELEGRAM_BOT_USERNAME: '',
            TELEGRAM_UPDATES_MODE: '',
            TELEGRAM_WEBHOOK_URL: '',
            TELEGRAM_WEBHOOK_SECRET: '',
        });

        expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
        expect(env.TELEGRAM_UPDATES_MODE).toBe('off');
    });

    it('accepts a full webhook configuration and numeric overrides', () => {
        const env = validateEnv({
            ...WEBHOOK_ENV,
            TELEGRAM_LINK_TOKEN_TTL_SECONDS: '300',
            TELEGRAM_DELIVERY_RESERVATION_MS: '90000',
            TELEGRAM_API_BASE_URL: 'http://127.0.0.1:8081',
        });

        expect(env.TELEGRAM_UPDATES_MODE).toBe('webhook');
        expect(env.TELEGRAM_WEBHOOK_URL).toBe('https://api.example.com/telegram/webhook');
        expect(env.TELEGRAM_WEBHOOK_SECRET).toBe(WEBHOOK_SECRET);
        expect(env.TELEGRAM_LINK_TOKEN_TTL_SECONDS).toBe(300);
        expect(env.TELEGRAM_DELIVERY_RESERVATION_MS).toBe(90000);
        expect(env.TELEGRAM_API_BASE_URL).toBe('http://127.0.0.1:8081');
    });

    it('accepts polling without webhook settings', () => {
        const env = validateEnv({ ...REQUIRED_ENV, TELEGRAM_UPDATES_MODE: 'polling' });

        expect(env.TELEGRAM_UPDATES_MODE).toBe('polling');
    });

    it('requires the webhook url in webhook mode', () => {
        const { TELEGRAM_WEBHOOK_URL: _omit, ...withoutUrl } = WEBHOOK_ENV;

        expect(() => validateEnv(withoutUrl)).toThrow('TELEGRAM_WEBHOOK_URL');
    });

    it('requires the webhook secret in webhook mode', () => {
        const { TELEGRAM_WEBHOOK_SECRET: _omit, ...withoutSecret } = WEBHOOK_ENV;

        expect(() => validateEnv(withoutSecret)).toThrow('TELEGRAM_WEBHOOK_SECRET');
    });

    it('rejects a webhook secret shorter than 32 characters', () => {
        expect(() =>
            validateEnv({ ...WEBHOOK_ENV, TELEGRAM_WEBHOOK_SECRET: 's'.repeat(31) }),
        ).toThrow('TELEGRAM_WEBHOOK_SECRET');
    });

    it('rejects a webhook secret with characters Telegram does not allow', () => {
        expect(() =>
            validateEnv({ ...WEBHOOK_ENV, TELEGRAM_WEBHOOK_SECRET: `${'s'.repeat(32)}!` }),
        ).toThrow('TELEGRAM_WEBHOOK_SECRET');
    });

    it('rejects a webhook url that is not https', () => {
        expect(() =>
            validateEnv({ ...WEBHOOK_ENV, TELEGRAM_WEBHOOK_URL: 'http://api.example.com/hook' }),
        ).toThrow('TELEGRAM_WEBHOOK_URL');
    });

    it.each([
        ['TELEGRAM_UPDATES_MODE', 'push'],
        ['TELEGRAM_LINK_TOKEN_TTL_SECONDS', '0'],
        ['TELEGRAM_LINK_TOKEN_TTL_SECONDS', 'long'],
        ['TELEGRAM_DELIVERY_RESERVATION_MS', '-1'],
        ['TELEGRAM_DELIVERY_RESERVATION_MS', '1.5'],
        ['TELEGRAM_API_BASE_URL', 'not a url'],
        ['TELEGRAM_BOT_USERNAME', 'bad name'],
    ])('rejects %s=%s', (name, value) => {
        expect(() => validateEnv({ ...REQUIRED_ENV, [name]: value })).toThrow(name);
    });

    it('does not put the bot token into validation errors', () => {
        const { TELEGRAM_WEBHOOK_SECRET: _omit, ...withoutSecret } = WEBHOOK_ENV;

        const missingSecret = errorText(withoutSecret);
        const invalidFields = errorText({
            ...WEBHOOK_ENV,
            TELEGRAM_WEBHOOK_URL: 'not a url',
            TELEGRAM_DELIVERY_RESERVATION_MS: 'soon',
        });

        expect(missingSecret).toContain('TELEGRAM_WEBHOOK_SECRET');
        expect(invalidFields).toContain('TELEGRAM_DELIVERY_RESERVATION_MS');
        expect(`${missingSecret}\n${invalidFields}`).not.toContain(BOT_TOKEN);
    });
});

describe('validateEnv transcription settings', () => {
    it('uses gemini-3.1-flash-lite for transcription by default', () => {
        expect(validateEnv(REQUIRED_ENV).TRANSCRIPTION_MODEL).toBe('google/gemini-3.1-flash-lite');
    });

    it('treats an empty TRANSCRIPTION_MODEL as missing', () => {
        expect(validateEnv({ ...REQUIRED_ENV, TRANSCRIPTION_MODEL: '' }).TRANSCRIPTION_MODEL).toBe(
            'google/gemini-3.1-flash-lite',
        );
    });

    it('accepts another transcription model', () => {
        const env = validateEnv({ ...REQUIRED_ENV, TRANSCRIPTION_MODEL: 'openai/gpt-audio-mini' });

        expect(env.TRANSCRIPTION_MODEL).toBe('openai/gpt-audio-mini');
    });
});

describe('validateEnv file storage settings', () => {
    it('uses local MinIO defaults for S3', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.S3_ENDPOINT).toBe('http://localhost:9000');
        expect(env.S3_REGION).toBe('us-east-1');
        expect(env.S3_ACCESS_KEY).toBe('minioadmin');
        expect(env.S3_SECRET_KEY).toBe('minioadmin');
        expect(env.S3_BUCKET).toBe('files');
        expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    });

    it.each(['S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const)(
        'requires %s in production instead of the MinIO default',
        (name) => {
            const production = {
                ...REQUIRED_ENV,
                NODE_ENV: 'production',
                S3_ACCESS_KEY: 'prod-access-key',
                S3_SECRET_KEY: 'prod-secret-key',
            };

            expect(() => validateEnv({ ...production, [name]: '' })).toThrow(
                `${name} is required when NODE_ENV=production`,
            );
            expect(validateEnv(production)[name]).toBe(production[name]);
        },
    );

    it('parses S3_FORCE_PATH_STYLE=false', () => {
        expect(
            validateEnv({ ...REQUIRED_ENV, S3_FORCE_PATH_STYLE: 'false' }).S3_FORCE_PATH_STYLE,
        ).toBe(false);
    });

    it('uses FILES_* defaults from design', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.FILES_MAX_RECORDING_MB).toBe(1024);
        expect(env.FILES_MAX_DOCUMENT_MB).toBe(50);
        expect(env.FILES_DOCUMENT_RETENTION_DAYS).toBe(30);
        expect(env.FILES_RECORDING_RETENTION_DAYS).toBe(1);
        expect(env.FILES_MAX_HOLD_DAYS).toBe(7);
        expect(env.FILES_PURGE_CRON).toBe('0 3 * * *');
        expect(env.FILES_DOWNLOAD_LINK_TTL_SEC).toBe(300);
        expect(env.FILES_DOWNLOAD_TOKEN_SECRET).toBeUndefined();
    });

    it('accepts a download token secret of 32+ characters', () => {
        const secret = 'x'.repeat(32);

        expect(
            validateEnv({ ...REQUIRED_ENV, FILES_DOWNLOAD_TOKEN_SECRET: secret })
                .FILES_DOWNLOAD_TOKEN_SECRET,
        ).toBe(secret);
    });

    it('rejects a download token secret shorter than 32 characters', () => {
        expect(() =>
            validateEnv({ ...REQUIRED_ENV, FILES_DOWNLOAD_TOKEN_SECRET: 'x'.repeat(31) }),
        ).toThrow('FILES_DOWNLOAD_TOKEN_SECRET');
    });

    it.each([
        ['S3_ENDPOINT', 'not a url'],
        ['S3_FORCE_PATH_STYLE', 'yes'],
        ['FILES_MAX_RECORDING_MB', '0'],
        ['FILES_RECORDING_RETENTION_DAYS', '1.5'],
        ['FILES_DOWNLOAD_LINK_TTL_SEC', '-1'],
    ])('rejects %s=%s', (name, value) => {
        expect(() => validateEnv({ ...REQUIRED_ENV, [name]: value })).toThrow(name);
    });
});

describe('validateEnv meeting transcription settings', () => {
    it('uses defaults from design', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.MEETING_TRANSCRIPTION_MODEL).toBe('elevenlabs/scribe-v2');
        expect(env.MEETING_TRANSCRIPTION_LANGUAGE).toBeUndefined();
        expect(env.MEETING_TRANSCRIPTION_MAX_DURATION_SEC).toBe(14400);
        expect(env.MEETING_TRANSCRIPTION_CHUNK_SEC).toBe(600);
        expect(env.MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC).toBe(30);
        expect(env.MEETING_TRANSCRIPTION_MAX_CHUNK_BYTES).toBe(20971520);
        expect(env.MEETING_TRANSCRIPTION_CHUNK_TIMEOUT_MS).toBe(90000);
        expect(env.MEETING_TRANSCRIPTION_MAX_EXEMPLARS).toBe(8);
        expect(env.MEETING_TRANSCRIPTION_EXEMPLAR_SEC).toBe(10);
        expect(env).not.toHaveProperty('MEETING_TRANSCRIPTION_CHUNK_CONCURRENCY');
        expect(env.MEETING_TRANSCRIPTION_ATTEMPTS).toBe(3);
        expect(env.MEETING_TRANSCRIPTION_CONCURRENCY).toBe(2);
        expect(env.MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS).toBe(7_200_000);
    });

    it('treats an empty language as missing and accepts a set one', () => {
        expect(
            validateEnv({ ...REQUIRED_ENV, MEETING_TRANSCRIPTION_LANGUAGE: '' })
                .MEETING_TRANSCRIPTION_LANGUAGE,
        ).toBeUndefined();
        expect(
            validateEnv({ ...REQUIRED_ENV, MEETING_TRANSCRIPTION_LANGUAGE: 'ru' })
                .MEETING_TRANSCRIPTION_LANGUAGE,
        ).toBe('ru');
    });

    it.each([
        ['MEETING_TRANSCRIPTION_CHUNK_SEC', '0'],
        ['MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC', '-1'],
        ['MEETING_TRANSCRIPTION_MAX_EXEMPLARS', 'many'],
        ['MEETING_TRANSCRIPTION_EXEMPLAR_SEC', '0'],
    ])('rejects %s=%s', (name, value) => {
        expect(() => validateEnv({ ...REQUIRED_ENV, [name]: value })).toThrow(name);
    });

    it('rejects an overlap not shorter than the chunk', () => {
        expect(() =>
            validateEnv({
                ...REQUIRED_ENV,
                MEETING_TRANSCRIPTION_CHUNK_SEC: '60',
                MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC: '60',
            }),
        ).toThrow('MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC');
    });
});

describe('validateEnv meeting tasks and chat system message settings', () => {
    it('uses defaults from design', () => {
        const env = validateEnv(REQUIRED_ENV);

        expect(env.MEETING_TASKS_EXTRACTION_MODEL).toBeUndefined();
        expect(env.MEETING_TASKS_WINDOW_TOKENS).toBe(60_000);
        expect(env.MEETING_TASKS_WINDOW_MINUTES).toBe(30);
        expect(env.CHAT_SYSTEM_MESSAGE_RETRY_MS).toBe(5000);
        expect(env.CHAT_SYSTEM_MESSAGE_DEADLINE_MS).toBe(600_000);
    });

    it('treats an empty extraction model as missing and accepts a set one', () => {
        expect(
            validateEnv({ ...REQUIRED_ENV, MEETING_TASKS_EXTRACTION_MODEL: '' })
                .MEETING_TASKS_EXTRACTION_MODEL,
        ).toBeUndefined();
        expect(
            validateEnv({ ...REQUIRED_ENV, MEETING_TASKS_EXTRACTION_MODEL: 'openai/gpt-4.1' })
                .MEETING_TASKS_EXTRACTION_MODEL,
        ).toBe('openai/gpt-4.1');
    });

    it.each([
        ['MEETING_TASKS_WINDOW_TOKENS', '0'],
        ['MEETING_TASKS_WINDOW_MINUTES', '1.5'],
        ['CHAT_SYSTEM_MESSAGE_RETRY_MS', '-1'],
        ['CHAT_SYSTEM_MESSAGE_DEADLINE_MS', 'soon'],
    ])('rejects %s=%s', (name, value) => {
        expect(() => validateEnv({ ...REQUIRED_ENV, [name]: value })).toThrow(name);
    });
});
