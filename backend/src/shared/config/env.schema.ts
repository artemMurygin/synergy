import { z } from 'zod';

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
        OPENAI_BASE_URL: z.url().optional(),
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

        PROGRAMS_ETL_SCHEDULER_ENABLED: z
            .enum(['true', 'false'])
            .default('false')
            .transform((v) => v === 'true'),
        PROGRAMS_ETL_SCAN_CRON: z.string().min(1).default('0 * * * *'),
        PROGRAMS_ETL_CONCURRENCY: z.coerce.number().int().positive().default(1),
        PROGRAMS_ETL_ATTEMPTS: z.coerce.number().int().positive().default(3),
        PROGRAMS_ETL_BACKOFF_MS: z.coerce.number().int().nonnegative().default(5000),
        PROGRAMS_ETL_OPENAI_MODEL: z.string().min(1).default('gpt-4o'),
        PROGRAMS_ETL_AGENT_MAX_STEPS: z.coerce.number().int().positive().default(40),
        PROGRAMS_ETL_AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
        PROGRAMS_ETL_SHEETS_MAX_CELLS: z.coerce.number().int().positive().default(400),

        LANGSMITH_TRACING: z
            .enum(['true', 'false'])
            .default('false')
            .transform((v) => v === 'true'),
        LANGSMITH_API_KEY: z.string().optional(),
        LANGSMITH_PROJECT: z.string().default('audit-agent'),
        LANGSMITH_ENDPOINT: z.url().optional(),

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
    .refine((env) => !env.PROGRAMS_ETL_SCHEDULER_ENABLED || env.OPENAI_API_KEY !== undefined, {
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when PROGRAMS_ETL_SCHEDULER_ENABLED=true',
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
