import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthSettings } from '../../domain/ports/auth-settings.port';

export const REFRESH_COOKIE = 'mh_refresh';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

@Injectable()
export class RefreshCookieService {
    constructor(private readonly settings: AuthSettings) {}

    set(request: Request, response: Response, secret: string): void {
        response.cookie(REFRESH_COOKIE, secret, {
            ...this.scope(request),
            maxAge: this.settings.refreshTtlMs,
        });
    }

    clear(request: Request, response: Response): void {
        response.clearCookie(REFRESH_COOKIE, this.scope(request));
    }

    read(request: Request): string | undefined {
        const value = (request.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
        return typeof value === 'string' && value !== '' ? value : undefined;
    }

    private scope(request: Request): {
        httpOnly: true;
        sameSite: 'strict';
        path: string;
        secure: boolean;
    } {
        return {
            httpOnly: true,
            sameSite: 'strict',
            path: '/auth',
            secure: !LOCAL_HOSTS.has(request.hostname),
        };
    }
}
