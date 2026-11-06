import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../shared/config/env.schema';
import { LoginThrottlerLimits } from '../application/login-throttler';
import { AuthHttpSettings } from '../interface/auth-http.settings';

@Injectable()
export class EnvAuthHttpSettings extends AuthHttpSettings {
    readonly allowedOrigins: string[];

    constructor(config: ConfigService<Env, true>) {
        super();
        this.allowedOrigins = config.get('AUTH_ALLOWED_ORIGINS', { infer: true });
    }
}

@Injectable()
export class EnvLoginThrottlerLimits extends LoginThrottlerLimits {
    readonly maxAttempts: number;
    readonly windowMs: number;

    constructor(config: ConfigService<Env, true>) {
        super();
        this.maxAttempts = config.get('AUTH_LOGIN_MAX_ATTEMPTS', { infer: true });
        this.windowMs = config.get('AUTH_LOGIN_WINDOW_MINUTES', { infer: true }) * 60_000;
    }
}
