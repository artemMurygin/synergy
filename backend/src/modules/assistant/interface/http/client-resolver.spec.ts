import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ClientResolver } from './client-resolver';

describe('ClientResolver', () => {
    const resolver = new ClientResolver();
    const request = (
        value?: string | string[],
    ): { header: (name: string) => string | undefined } => ({
        header: (name) => (name.toLowerCase() === 'x-client-app' ? (value as string) : undefined),
    });

    it.each(['manager-app', 'employee-app'])('resolves X-Client-App: %s', (value) => {
        expect(resolver.resolve(request(value))).toBe(value);
    });

    it('treats a missing header as a neutral app client without picking a concrete app', () => {
        expect(resolver.resolve(request())).toBe('app');
    });

    it.each(['unknown-app', 'telegram', 'TELEGRAM', 'app', ''])('rejects %j with 400', (value) => {
        expect(() => resolver.resolve(request(value))).toThrow(BadRequestException);
    });

    it('reads the header only, not the request body', () => {
        const req = { ...request('employee-app'), body: { client: 'telegram' } };
        expect(resolver.resolve(req)).toBe('employee-app');
    });
});
