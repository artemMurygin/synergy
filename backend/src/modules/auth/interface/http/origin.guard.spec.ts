import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ForbiddenOriginError } from '../../domain/errors';
import { OriginGuard } from './origin.guard';

function context(headers: Record<string, string>): ExecutionContext {
    const request = { header: (name: string) => headers[name.toLowerCase()] };
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

const guard = (allowed: string[]): OriginGuard => new OriginGuard({ allowedOrigins: allowed });

describe('OriginGuard', () => {
    it('lets a listed origin through', () => {
        expect(
            guard(['chrome-extension://abc']).canActivate(
                context({ origin: 'chrome-extension://abc' }),
            ),
        ).toBe(true);
    });

    it('lets any extension through for chrome-extension://*', () => {
        expect(
            guard(['chrome-extension://*']).canActivate(
                context({ origin: 'chrome-extension://zzz' }),
            ),
        ).toBe(true);
    });

    it('rejects a web origin when only extensions are allowed', () => {
        expect(() =>
            guard(['chrome-extension://*']).canActivate(
                context({ origin: 'https://evil.example' }),
            ),
        ).toThrow(ForbiddenOriginError);
    });

    it('rejects a request without Origin', () => {
        expect(() => guard(['chrome-extension://*']).canActivate(context({}))).toThrow(
            ForbiddenOriginError,
        );
    });

    it('skips the check for desktop clients', () => {
        expect(guard([]).canActivate(context({ 'x-client-type': 'desktop' }))).toBe(true);
    });
});
