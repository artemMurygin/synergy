import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS } from './log-redact-paths';

describe('LOG_REDACT_PATHS', () => {
    it('hides credentials and the Telegram webhook secret in request logs', () => {
        const lines: string[] = [];
        const logger = pino(
            { redact: { paths: [...LOG_REDACT_PATHS], censor: '[Redacted]' } },
            { write: (line: string) => lines.push(line) },
        );

        logger.info({
            req: {
                headers: {
                    authorization: 'Bearer access-token',
                    cookie: 'mh_refresh=refresh-token',
                    'x-telegram-bot-api-secret-token': 'webhook-secret-value',
                },
            },
        });

        const output = lines.join('');
        expect(output).not.toContain('access-token');
        expect(output).not.toContain('refresh-token');
        expect(output).not.toContain('webhook-secret-value');
    });
});
