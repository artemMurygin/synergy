import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { isOriginAllowed } from './origin-matcher';

export interface HttpOptions {
    allowedOrigins: readonly string[];
    /** Express `trust proxy` value: `true`, a hop count or a subnet list. */
    trustProxy?: string;
}

export function parseTrustProxy(raw: string | undefined): boolean | number | string | undefined {
    const value = raw?.trim() ?? '';
    if (value === '') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return /^\d+$/.test(value) ? Number(value) : value;
}

export function configureHttp(app: NestExpressApplication, options: HttpOptions): void {
    const trustProxy = parseTrustProxy(options.trustProxy);
    if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
    app.use(cookieParser());
    app.enableCors({
        origin: (origin, callback) => {
            callback(null, origin === undefined || isOriginAllowed(origin, options.allowedOrigins));
        },
        credentials: true,
        allowedHeaders: ['Authorization', 'Content-Type', 'X-Client-Type'],
        exposedHeaders: ['Retry-After'],
    });
}
