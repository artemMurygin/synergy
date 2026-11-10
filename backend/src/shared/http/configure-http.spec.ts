import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { configureHttp, parseTrustProxy } from './configure-http';

const ORIGIN = 'chrome-extension://abc';

@Controller('probe')
class ProbeController {
    @Post()
    echo(@Body() body: { text?: string }): { length: number } {
        return { length: body.text?.length ?? 0 };
    }

    @Get()
    read(@Req() request: Request): { cookies: unknown; ip: string | undefined } {
        return { cookies: request.cookies, ip: request.ip };
    }
}

let app: NestExpressApplication | undefined;

async function start(options: Parameters<typeof configureHttp>[1]): Promise<string> {
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureHttp(app, options);
    await app.listen(0);
    return (await app.getUrl()).replace('[::1]', 'localhost');
}

afterEach(async () => {
    await app?.close();
    app = undefined;
});

describe('configureHttp', () => {
    const post = (base: string, text: string): Promise<Response> =>
        fetch(`${base}/probe`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
        });

    it('accepts a JSON body above the Express default of 100kb', async () => {
        const base = await start({ allowedOrigins: [] });
        const response = await post(base, 'a'.repeat(150_000));
        expect(response.status).toBe(201);
    });

    it('answers the preflight of any extension for a scheme wildcard', async () => {
        const base = await start({ allowedOrigins: ['chrome-extension://*'] });
        const response = await fetch(`${base}/probe`, {
            method: 'OPTIONS',
            headers: { origin: 'chrome-extension://zzz', 'access-control-request-method': 'POST' },
        });
        expect(response.headers.get('access-control-allow-origin')).toBe('chrome-extension://zzz');
        expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('does not answer a web origin for a scheme wildcard', async () => {
        const base = await start({ allowedOrigins: ['chrome-extension://*'] });
        const response = await fetch(`${base}/probe`, {
            method: 'OPTIONS',
            headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
        });
        expect(response.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('parses cookies', async () => {
        const base = await start({ allowedOrigins: [ORIGIN] });
        const response = await fetch(`${base}/probe`, { headers: { cookie: 'mh_refresh=abc' } });
        expect(await response.json()).toMatchObject({ cookies: { mh_refresh: 'abc' } });
    });

    it('answers the preflight of an allowed origin with credentials', async () => {
        const base = await start({ allowedOrigins: [ORIGIN] });
        const response = await fetch(`${base}/probe`, {
            method: 'OPTIONS',
            headers: {
                origin: ORIGIN,
                'access-control-request-method': 'POST',
                'access-control-request-headers': 'authorization,content-type,x-client-type',
            },
        });
        expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
        expect(response.headers.get('access-control-allow-credentials')).toBe('true');
        expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
            'authorization',
        );
    });

    it('exposes Retry-After and does not allow a foreign origin', async () => {
        const base = await start({ allowedOrigins: [ORIGIN] });
        const allowed = await fetch(`${base}/probe`, { headers: { origin: ORIGIN } });
        expect(allowed.headers.get('access-control-expose-headers')).toContain('Retry-After');
        const foreign = await fetch(`${base}/probe`, {
            headers: { origin: 'https://evil.example' },
        });
        expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('takes the client address from X-Forwarded-For only when the proxy is trusted', async () => {
        const headers = { 'x-forwarded-for': '203.0.113.7' };
        const trusted = await start({ allowedOrigins: [], trustProxy: '1' });
        expect(await (await fetch(`${trusted}/probe`, { headers })).json()).toMatchObject({
            ip: '203.0.113.7',
        });
        await app?.close();

        const untrusted = await start({ allowedOrigins: [] });
        const body = (await (await fetch(`${untrusted}/probe`, { headers })).json()) as {
            ip: string;
        };
        expect(body.ip).not.toBe('203.0.113.7');
    });
});

describe('parseTrustProxy', () => {
    it.each([
        [undefined, undefined],
        ['', undefined],
        ['true', true],
        ['false', false],
        ['2', 2],
        ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
    ])('reads %j as %j', (raw, expected) => {
        expect(parseTrustProxy(raw)).toBe(expected);
    });
});
