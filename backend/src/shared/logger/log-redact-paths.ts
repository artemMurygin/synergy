export const LOG_REDACT_PATHS = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-telegram-bot-api-secret-token"]',
    'res.headers["set-cookie"]',
    'req.query.token',
    '*.password',
    '*.apiKey',
] as const;
