import { z } from 'zod';

const MAX_WS_PING_INTERVAL_MS = 25_000;
const TELEGRAM_WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const TELEGRAM_BOT_USERNAME_PATTERN = /^@?[A-Za-z0-9_]{5,32}$/;

const ttl = (fallback: string): z.ZodDefault<z.ZodString> =>
    z
        .string()
        .regex(/^\d+[smhd]$/)
        .default(fallback);

const positiveInt = (fallback: number): z.ZodDefault<z.ZodCoercedNumber> =>
    z.coerce.number().int().positive().default(fallback);

// Заводские ключи MinIO из compose: допустимы только вне production.
const DEV_S3_CREDENTIAL = 'minioadmin';
const PRODUCTION_S3_CREDENTIALS = ['S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const;

const bool = (fallback: 'true' | 'false'): z.ZodType<boolean, 'true' | 'false' | undefined> =>
    z
        .enum(['true', 'false'])
        .default(fallback)
        .transform((v) => v === 'true');

export const envSchema = z
    .object({
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        PORT: z.coerce.number().int().default(3000),
        LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

        POSTGRES_URL: z.string().min(1),
        MSSQL_URL: z.string().min(1),

        REDIS_HOST: z.string().default('localhost'),
        REDIS_PORT: z.coerce.number().int().default(6379),
        REDIS_PASSWORD: z.string().optional(),
        REDIS_DB: z.coerce.number().int().default(0),

        OPENAI_API_KEY: z.string().optional(),
        OPENROUTER_API_KEY: z.string().optional(),
        OPENAI_BASE_URL: z.url().optional(),
        // Base URL of OpenRouter or of a reverse proxy in front of it
        OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
        OPENAI_MODEL: z.string().default('gpt-4o-mini'),
        OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
        OPENAI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(1),
        // Speech-to-text model on OpenRouter, receives voice messages as input_audio
        TRANSCRIPTION_MODEL: z.string().min(1).default('google/gemini-3.1-flash-lite'),

        DEAL_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
        DEAL_SYNC_DEFAULT_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
        CRM_DRIVER: z.enum(['mock']).default('mock'),
        TELEGRAM_BOT_TOKEN: z.string().optional(),
        TELEGRAM_BOT_USERNAME: z.string().regex(TELEGRAM_BOT_USERNAME_PATTERN).optional(),
        TELEGRAM_UPDATES_MODE: z.enum(['webhook', 'polling', 'off']).default('off'),
        TELEGRAM_WEBHOOK_URL: z.url({ protocol: /^https$/ }).optional(),
        TELEGRAM_WEBHOOK_SECRET: z
            .string()
            .regex(TELEGRAM_WEBHOOK_SECRET_PATTERN, {
                message:
                    'TELEGRAM_WEBHOOK_SECRET must be 32-256 characters of A-Z, a-z, 0-9, _ or -',
            })
            .optional(),
        TELEGRAM_LINK_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(600),
        TELEGRAM_DELIVERY_RESERVATION_MS: z.coerce.number().int().positive().default(120000),
        TELEGRAM_API_BASE_URL: z.url().default('https://api.telegram.org'),

        DEAL_SYNC_ATTEMPTS: z.coerce.number().int().positive().default(3),
        DEAL_SYNC_BACKOFF_MS: z.coerce.number().int().nonnegative().default(5000),
        AUDIT_ATTEMPTS: z.coerce.number().int().positive().default(3),
        AUDIT_BACKOFF_MS: z.coerce.number().int().nonnegative().default(10000),
        NOTIFICATION_ATTEMPTS: z.coerce.number().int().positive().default(5),
        NOTIFICATION_BACKOFF_MS: z.coerce.number().int().nonnegative().default(5000),

        GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().min(1).optional(),

        LANGSMITH_TRACING: z
            .enum(['true', 'false'])
            .default('false')
            .transform((v) => v === 'true'),
        LANGSMITH_API_KEY: z.string().optional(),
        LANGSMITH_PROJECT: z.string().default('audit-agent'),
        LANGSMITH_ENDPOINT: z.url().optional(),

        JWT_SECRET: z.string().min(32),
        AUTH_ACCESS_TTL: ttl('15m'),
        AUTH_REFRESH_TTL: ttl('14d'),
        AUTH_REFRESH_GRACE_SECONDS: z.coerce.number().int().nonnegative().default(10),
        AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
        AUTH_LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
        AUTH_ALLOWED_ORIGINS: z
            .string()
            .default('')
            .transform((v) =>
                v
                    .split(',')
                    .map((o) => o.trim())
                    .filter((o) => o !== ''),
            ),
        TRUST_PROXY: z.string().optional(),
        AUTH_SEED_USERS: z
            .string()
            .optional()
            .transform((v, ctx) => {
                if (v === undefined) return undefined;
                try {
                    return JSON.parse(v) as unknown;
                } catch {
                    ctx.addIssue({ code: 'custom', message: 'AUTH_SEED_USERS must be valid JSON' });
                    return z.NEVER;
                }
            })
            .pipe(
                z
                    .array(
                        z.object({
                            login: z.string().min(1),
                            password: z.string().min(1).optional(),
                        }),
                    )
                    .optional(),
            ),

        TASKS_STORAGE_DIR: z.string().min(1).default('./storage/tasks'),
        TASKS_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(20),
        TASKS_MAX_FILES_PER_TASK: z.coerce.number().int().positive().default(10),

        // S3-совместимое хранилище файлов (локально MinIO из compose)
        S3_ENDPOINT: z.url().default('http://localhost:9000'),
        S3_REGION: z.string().min(1).default('us-east-1'),
        S3_ACCESS_KEY: z.string().min(1).optional(),
        S3_SECRET_KEY: z.string().min(1).optional(),
        S3_BUCKET: z.string().min(1).default('files'),
        S3_FORCE_PATH_STYLE: bool('true'),

        FILES_MAX_RECORDING_MB: positiveInt(1024),
        FILES_MAX_DOCUMENT_MB: positiveInt(50),
        FILES_DOCUMENT_RETENTION_DAYS: positiveInt(30),
        FILES_RECORDING_RETENTION_DAYS: positiveInt(1),
        FILES_MAX_HOLD_DAYS: positiveInt(7),
        FILES_PURGE_CRON: z.string().min(1).default('0 3 * * *'),
        // Секрет ссылок скачивания; без него выдача ссылок недоступна
        FILES_DOWNLOAD_TOKEN_SECRET: z.string().min(32).optional(),
        FILES_DOWNLOAD_LINK_TTL_SEC: positiveInt(300),

        MEETING_TRANSCRIPTION_MODEL: z.string().min(1).default('elevenlabs/scribe-v2'),
        // Пусто: язык определяет модель
        MEETING_TRANSCRIPTION_LANGUAGE: z.string().min(1).optional(),
        MEETING_TRANSCRIPTION_MAX_DURATION_SEC: positiveInt(14400),
        MEETING_TRANSCRIPTION_CHUNK_SEC: positiveInt(600),
        MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC: z.coerce.number().int().nonnegative().default(30),
        MEETING_TRANSCRIPTION_MAX_CHUNK_BYTES: positiveInt(20971520),
        MEETING_TRANSCRIPTION_CHUNK_TIMEOUT_MS: positiveInt(90000),
        MEETING_TRANSCRIPTION_MAX_EXEMPLARS: positiveInt(8),
        MEETING_TRANSCRIPTION_EXEMPLAR_SEC: positiveInt(10),
        MEETING_TRANSCRIPTION_ATTEMPTS: positiveInt(3),
        MEETING_TRANSCRIPTION_CONCURRENCY: positiveInt(2),
        // Общий дедлайн одной попытки расшифровки; по истечении — failed с причиной timeout
        MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS: positiveInt(7_200_000),

        OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
        OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(50),
        OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
        OUTBOX_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
        NOTIFICATIONS_WS_PING_INTERVAL_MS: z.coerce
            .number()
            .int()
            .positive()
            .max(MAX_WS_PING_INTERVAL_MS)
            .default(20000),

        LOKI_URL: z.string().optional(),
        LOKI_LABELS_APP: z.string().default('audit-agent'),
        METRICS_ENABLED: z
            .enum(['true', 'false'])
            .default('true')
            .transform((v) => v === 'true'),
    })
    .refine((env) => !env.LANGSMITH_TRACING || env.LANGSMITH_API_KEY !== undefined, {
        path: ['LANGSMITH_API_KEY'],
        message: 'LANGSMITH_API_KEY is required when LANGSMITH_TRACING=true',
    })
    .refine(
        (env) => env.MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC < env.MEETING_TRANSCRIPTION_CHUNK_SEC,
        {
            path: ['MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC'],
            message:
                'MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC must be less than MEETING_TRANSCRIPTION_CHUNK_SEC',
        },
    )
    .superRefine((env, ctx) => {
        if (env.TELEGRAM_UPDATES_MODE !== 'webhook') return;
        if (env.TELEGRAM_WEBHOOK_URL === undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['TELEGRAM_WEBHOOK_URL'],
                message: 'TELEGRAM_WEBHOOK_URL is required when TELEGRAM_UPDATES_MODE=webhook',
            });
        }
        if (env.TELEGRAM_WEBHOOK_SECRET === undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['TELEGRAM_WEBHOOK_SECRET'],
                message: 'TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_UPDATES_MODE=webhook',
            });
        }
    })
    .superRefine((env, ctx) => {
        if (env.NODE_ENV !== 'production') return;
        for (const name of PRODUCTION_S3_CREDENTIALS) {
            if (env[name] !== undefined) continue;
            ctx.addIssue({
                code: 'custom',
                path: [name],
                message: `${name} is required when NODE_ENV=production`,
            });
        }
    })
    .transform((env) => ({
        ...env,
        S3_ACCESS_KEY: env.S3_ACCESS_KEY ?? DEV_S3_CREDENTIAL,
        S3_SECRET_KEY: env.S3_SECRET_KEY ?? DEV_S3_CREDENTIAL,
    }));

export type Env = z.output<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
    // Пустые строки из .env считаем отсутствующими значениями
    const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
    const parsed = envSchema.safeParse(cleaned);
    if (!parsed.success) {
        throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
}
