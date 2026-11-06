import { Injectable } from '@nestjs/common';
import {
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    RefreshRaceError,
    SamePasswordError,
    WeakPasswordError,
    WrongPasswordError,
} from '../domain/errors';
import { PasswordPolicy } from '../domain/password-policy';
import { AccessTokenService } from '../domain/ports/access-token-service.port';
import { AuthSessionRepository } from '../domain/ports/auth-session-repository.port';
import { AuthSettings } from '../domain/ports/auth-settings.port';
import { Clock } from '../domain/ports/clock.port';
import { PasswordHasher } from '../domain/ports/password-hasher.port';
import { RefreshTokenFactory } from '../domain/ports/refresh-token-factory.port';
import { TransactionRunner } from '../domain/ports/transaction-runner.port';
import { UserRepository } from '../domain/ports/user-repository.port';
import type { TokenPair } from '../domain/token-pair';

@Injectable()
export class ChangePasswordUseCase {
    constructor(
        private readonly users: UserRepository,
        private readonly sessions: AuthSessionRepository,
        private readonly hasher: PasswordHasher,
        private readonly accessTokens: AccessTokenService,
        private readonly refreshTokens: RefreshTokenFactory,
        private readonly clock: Clock,
        private readonly settings: AuthSettings,
        private readonly tx: TransactionRunner,
    ) {}

    async execute(
        userId: string,
        sessionId: string,
        current: string,
        next: string,
    ): Promise<TokenPair> {
        return this.tx.run(async () => {
            const user = await this.users.findById(userId);
            if (user?.canSignIn() !== true) throw new InvalidCredentialsError();
            const session = await this.sessions.findByIdForUpdate(sessionId);
            const presented = session?.userId === userId ? session.activeToken() : null;
            if (session === null || presented === null) throw new InvalidRefreshTokenError();

            if (!(await this.hasher.verify(user.passwordHash, current))) {
                throw new WrongPasswordError();
            }
            if (next === current) throw new SamePasswordError();
            const violations = PasswordPolicy.validate(next, user.login);
            if (violations.length > 0) throw new WeakPasswordError(violations);

            const now = this.clock.now();
            const issued = this.refreshTokens.issue(
                new Date(now.getTime() + this.settings.refreshTtlMs),
            );
            const rotation = session.rotate(
                presented.tokenHash,
                issued.token,
                now,
                this.settings.refreshGraceMs,
            );
            if (rotation.kind === 'Race') throw new RefreshRaceError();
            if (rotation.kind === 'ReuseDetected') throw new InvalidRefreshTokenError();

            user.changePassword(await this.hasher.hash(next), now);
            await this.users.save(user);
            await this.sessions.revokeAllForUser(userId, sessionId);
            await this.sessions.save(session);

            const access = this.accessTokens.sign({ sub: user.id, sid: session.id, mcp: false });
            return {
                access: access.token,
                expiresIn: access.expiresIn,
                refresh: issued.secret,
                mustChangePassword: false,
            };
        });
    }
}
