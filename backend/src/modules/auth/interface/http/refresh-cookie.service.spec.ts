import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { RefreshCookieService } from './refresh-cookie.service';

const service = new RefreshCookieService({ refreshTtlMs: 3_600_000, refreshGraceMs: 0 });

function res(): { cookie: ReturnType<typeof vi.fn>; clearCookie: ReturnType<typeof vi.fn> } {
    return { cookie: vi.fn(), clearCookie: vi.fn() };
}

describe('RefreshCookieService', () => {
    it('sets mh_refresh as HttpOnly, SameSite=Strict, Path=/auth, living as long as the token', () => {
        const response = res();
        service.set({ secure: false } as Request, response as unknown as Response, 'tok');
        expect(response.cookie).toHaveBeenCalledWith('mh_refresh', 'tok', {
            httpOnly: true,
            sameSite: 'strict',
            path: '/auth',
            secure: false,
            maxAge: 3_600_000,
        });
    });

    it('omits Secure over plain HTTP, so the browser keeps the cookie', () => {
        const response = res();
        service.set({ secure: false } as Request, response as unknown as Response, 'tok');
        expect(response.cookie.mock.calls[0][2]).toMatchObject({ secure: false });
    });

    it('sets Secure over HTTPS', () => {
        const response = res();
        service.set({ secure: true } as Request, response as unknown as Response, 't');
        expect(response.cookie.mock.calls[0][2]).toMatchObject({ secure: true });
    });

    it('clears the cookie with the same scope', () => {
        const response = res();
        service.clear({ secure: true } as Request, response as unknown as Response);
        expect(response.clearCookie).toHaveBeenCalledWith('mh_refresh', {
            httpOnly: true,
            sameSite: 'strict',
            path: '/auth',
            secure: true,
        });
    });

    it('reads the cookie, ignoring an empty or missing one', () => {
        expect(service.read({ cookies: { mh_refresh: 'tok' } } as unknown as Request)).toBe('tok');
        expect(service.read({ cookies: { mh_refresh: '' } } as unknown as Request)).toBeUndefined();
        expect(service.read({} as Request)).toBeUndefined();
    });
});
