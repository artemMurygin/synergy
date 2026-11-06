import { Injectable } from '@nestjs/common';
import { InvalidRefreshTokenError, RefreshRaceError } from '../domain/errors';
import { AccessTokenService } from '../domain/ports/access-token-service.port';
import { AuthSessionRepository } from '../domain/ports/auth-session-repository.port';
import { AuthSettings } from '../domain/ports/auth-settings.port';
import { Clock } from '../domain/ports/clock.port';
import { RefreshTokenFactory } from '../domain/ports/refresh-token-factory.port';
import { TransactionRunner } from '../domain/ports/transaction-runner.port';
import { UserRepository } from '../domain/ports/user-repository.port';
import type { TokenPair } from '../domain/token-pair';

type Outcome = { kind: 'ok'; pair: TokenPair } | { kind: 'race' } | { kind: 'invalid' };

@Injectable()
export class RefreshSessionUseCase {
    constructor(
        private readonly users: UserRepository,
        private readonly sessions: AuthSessionRepository,
        private readonly accessTokens: AccessTokenService,
        private readonly refreshTokens: RefreshTokenFactory,
        private readonly clock: Clock,
        private readonly settings: AuthSettings,
        private readonly tx: TransactionRunner,
    ) {}

    async execute(refreshSecret: string): Promise<TokenPair> {
        const outcome = await this.tx.run(() => this.rotate(refreshSecret));
        if (outcome.kind === 'race') throw new RefreshRaceError();
        if (outcome.kind === 'invalid') throw new InvalidRefreshTokenError();
        return outcome.pair;
    }

    private async rotate(refreshSecret: string): Promise<Outcome> {
        const session = await this.sessions.findByTokenHash(this.refreshTokens.hash(refreshSecret));
        if (session === null) return { kind: 'invalid' };

        const user = await this.users.findById(session.userId);
        if (user?.canSignIn() !== true) return { kind: 'invalid' };

        const now = this.clock.now();
        const issued = this.refreshTokens.issue(
            new Date(now.getTime() + this.settings.refreshTtlMs),
        );
        let result;
        try {
            result = session.rotate(
                this.refreshTokens.hash(refreshSecret),
                issued.token,
                now,
                this.settings.refreshGraceMs,
            );
        } catch (error) {
            if (error instanceof InvalidRefreshTokenError) return { kind: 'invalid' };
            throw error;
        }
        if (result.kind === 'Race') return { kind: 'race' };
        await this.sessions.save(session);
        if (result.kind === 'ReuseDetected') return { kind: 'invalid' };

        const access = this.accessTokens.sign({
            sub: user.id,
            sid: session.id,
            mcp: user.mustChangePassword,
        });
        return {
            kind: 'ok',
            pair: {
                access: access.token,
                expiresIn: access.expiresIn,
                refresh: issued.secret,
                mustChangePassword: user.mustChangePassword,
            },
        };
    }
}
