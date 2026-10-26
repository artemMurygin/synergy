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
        OPENAI_MODEL: z.string().default('gpt-4o-mini'),

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
