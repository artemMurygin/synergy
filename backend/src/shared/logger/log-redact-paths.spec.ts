import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS } from './log-redact-paths';
import { serializeRequest } from './request-serializer';

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

    it('hides the download token from the query and the url', () => {
        const lines: string[] = [];
        const logger = pino(
            {
                redact: { paths: [...LOG_REDACT_PATHS], censor: '[Redacted]' },
                serializers: { req: serializeRequest },
            },
            { write: (line: string) => lines.push(line) },
        );

        logger.info({
            req: {
                method: 'GET',
                url: '/files/f-1/content?token=download-secret&x=1',
                query: { token: 'download-secret', x: '1' },
            },
        });

        const output = lines.join('');
        expect(output).not.toContain('download-secret');
        expect(output).toContain('/files/f-1/content?token=[Redacted]&x=1');
    });

    it('leaves requests without a token untouched', () => {
        expect(serializeRequest({ url: '/files/f-1?tokenizer=1', method: 'GET' })).toEqual({
            url: '/files/f-1?tokenizer=1',
            method: 'GET',
        });
    });
});
