import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../shared/config/env.schema';
import { AuthSettings } from '../domain/ports/auth-settings.port';

const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export function parseTtlMs(raw: string): number {
    const match = /^(\d+)([smhd])$/.exec(raw);
    if (match === null) throw new Error(`Invalid TTL: ${raw}`);
    return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

@Injectable()
export class EnvAuthSettings extends AuthSettings {
    readonly refreshTtlMs: number;
    readonly refreshGraceMs: number;

    constructor(config: ConfigService<Env, true>) {
        super();
        this.refreshTtlMs = parseTtlMs(config.get('AUTH_REFRESH_TTL', { infer: true }));
        this.refreshGraceMs = config.get('AUTH_REFRESH_GRACE_SECONDS', { infer: true }) * 1000;
    }
}
