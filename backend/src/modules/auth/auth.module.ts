import {
    Inject,
    Injectable,
    Logger,
    Module,
    type OnApplicationShutdown,
    type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Redis } from 'ioredis';
import { PostgresModule } from '../../database/postgres/postgres.module';
import type { Env } from '../../shared/config/env.schema';
import { ChangePasswordUseCase } from './application/change-password.use-case';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case';
import { ListActiveUsersUseCase } from './application/list-active-users.use-case';
import { LoginThrottler, LoginThrottlerLimits } from './application/login-throttler';
import { LoginUseCase } from './application/login.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { RefreshSessionUseCase } from './application/refresh-session.use-case';
import { SeedUsersUseCase } from './application/seed-users.use-case';
import { AUTH_REDIS } from './auth.tokens';
import { AccessTokenService } from './domain/ports/access-token-service.port';
import { AuthSessionRepository } from './domain/ports/auth-session-repository.port';
import { AuthSettings } from './domain/ports/auth-settings.port';
import { Clock } from './domain/ports/clock.port';
import { LoginAttemptStore } from './domain/ports/login-attempt-store.port';
import { PasswordGenerator } from './domain/ports/password-generator.port';
import { PasswordHasher } from './domain/ports/password-hasher.port';
import { RefreshTokenFactory } from './domain/ports/refresh-token-factory.port';
import { TransactionRunner } from './domain/ports/transaction-runner.port';
import { UserRepository } from './domain/ports/user-repository.port';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { CryptoRefreshTokenFactory } from './infrastructure/crypto-refresh-token.factory';
import {
    EnvAuthHttpSettings,
    EnvLoginThrottlerLimits,
} from './infrastructure/env-auth-http-settings';
import { EnvAuthSettings, parseTtlMs } from './infrastructure/env-auth-settings';
import { JwtAccessTokenService } from './infrastructure/jwt-access-token.service';
import { RandomPasswordGenerator } from './infrastructure/random-password-generator';
import { RedisLoginAttemptStore } from './infrastructure/redis-login-attempt-store';
import { SlonikAuthSessionRepository } from './infrastructure/slonik-auth-session.repository';
import { SlonikTransactionRunner } from './infrastructure/slonik-transaction-runner';
import { SlonikUserRepository } from './infrastructure/slonik-user.repository';
import { SystemClock } from './infrastructure/system-clock';
import { registerAuthErrorStatuses } from './interface/auth-error-status';
import { AuthHttpSettings } from './interface/auth-http.settings';
import { AuthController } from './interface/http/auth.controller';
import { JwtAuthGuard } from './interface/http/jwt-auth.guard';
import { LoginThrottlerGuard } from './interface/http/login-throttler.guard';
import { OriginGuard } from './interface/http/origin.guard';
import { PasswordChangeGuard } from './interface/http/password-change.guard';
import { RefreshCookieService } from './interface/http/refresh-cookie.service';
import { UsersController } from './interface/http/users.controller';

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
    constructor(@Inject(AUTH_REDIS) private readonly client: Redis) {}

    async onApplicationShutdown(): Promise<void> {
        if (this.client.status === 'ready') await this.client.quit();
        else this.client.disconnect();
    }
}

@Module({
    imports: [PostgresModule],
    controllers: [AuthController, UsersController],
    providers: [
        LoginUseCase,
        RefreshSessionUseCase,
        LogoutUseCase,
        ChangePasswordUseCase,
        GetCurrentUserUseCase,
        ListActiveUsersUseCase,
        SeedUsersUseCase,
        LoginThrottler,
        LoginThrottlerGuard,
        OriginGuard,
        RefreshCookieService,
        SlonikTransactionRunner,
        { provide: TransactionRunner, useExisting: SlonikTransactionRunner },
        { provide: UserRepository, useClass: SlonikUserRepository },
        { provide: AuthSessionRepository, useClass: SlonikAuthSessionRepository },
        { provide: PasswordHasher, useClass: Argon2PasswordHasher },
        { provide: RefreshTokenFactory, useClass: CryptoRefreshTokenFactory },
        { provide: PasswordGenerator, useClass: RandomPasswordGenerator },
        { provide: Clock, useClass: SystemClock },
        { provide: AuthSettings, useClass: EnvAuthSettings },
        { provide: AuthHttpSettings, useClass: EnvAuthHttpSettings },
        { provide: LoginThrottlerLimits, useClass: EnvLoginThrottlerLimits },
        {
            provide: AccessTokenService,
            inject: [ConfigService, Clock],
            useFactory: (config: ConfigService<Env, true>, clock: Clock): AccessTokenService =>
                new JwtAccessTokenService({
                    secret: config.get('JWT_SECRET', { infer: true }),
                    ttlSeconds: parseTtlMs(config.get('AUTH_ACCESS_TTL', { infer: true })) / 1000,
                    clock,
                }),
        },
        {
            provide: AUTH_REDIS,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): Redis => {
                const client = new Redis({
                    host: config.get('REDIS_HOST', { infer: true }),
                    port: config.get('REDIS_PORT', { infer: true }),
                    password: config.get('REDIS_PASSWORD', { infer: true }),
                    db: config.get('REDIS_DB', { infer: true }),
                    lazyConnect: true,
                    commandTimeout: 1000,
                    maxRetriesPerRequest: 1,
                });
                const logger = new Logger('AuthRedis');
                client.on('error', (error: Error) => {
                    logger.error(error.message);
                });
                return client;
            },
        },
        RedisLifecycle,
        {
            provide: LoginAttemptStore,
            inject: [AUTH_REDIS],
            useFactory: (redis: Redis): LoginAttemptStore => new RedisLoginAttemptStore(redis),
        },
        // Deny by default: authentication first, then the forced password change check.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PasswordChangeGuard },
    ],
})
export class AuthModule implements OnModuleInit {
    onModuleInit(): void {
        registerAuthErrorStatuses();
    }
}
