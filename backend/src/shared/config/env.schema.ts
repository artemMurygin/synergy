import { z } from 'zod';

const ttl = (fallback: string): z.ZodDefault<z.ZodString> =>
    z
        .string()
        .regex(/^\d+[smhd]$/)
        .default(fallback);

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

        DEAL_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
        DEAL_SYNC_DEFAULT_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
        CRM_DRIVER: z.enum(['mock']).default('mock'),
        TELEGRAM_BOT_TOKEN: z.string().optional(),

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
    });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
    // Пустые строки из .env считаем отсутствующими значениями
    const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
    const parsed = envSchema.safeParse(cleaned);
    if (!parsed.success) {
        throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
}
