import { Controller, Get, Post, UseGuards, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ClientAppGuard } from './client-app.guard';

@Controller('probe')
@UseGuards(ClientAppGuard)
class ProbeController {
    @Get()
    read(): { ok: true } {
        return { ok: true };
    }

    @Post()
    write(): { ok: true } {
        return { ok: true };
    }
}

let app: INestApplication | undefined;

async function start(): Promise<string> {
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    return (await app.getUrl()).replace('[::1]', 'localhost');
}

afterEach(async () => {
    await app?.close();
    app = undefined;
});

describe('ClientAppGuard', () => {
    it('lets a request through without the header and with an app client', async () => {
        const base = await start();
        expect((await fetch(`${base}/probe`)).status).toBe(200);
        const employee = await fetch(`${base}/probe`, {
            headers: { 'x-client-app': 'employee-app' },
        });
        expect(employee.status).toBe(200);
    });

    it.each(['unknown-app', 'telegram'])('rejects X-Client-App: %s with 400', async (value) => {
        const base = await start();
        const response = await fetch(`${base}/probe`, {
            method: 'POST',
            headers: { 'x-client-app': value },
        });
        expect(response.status).toBe(400);
    });
});
