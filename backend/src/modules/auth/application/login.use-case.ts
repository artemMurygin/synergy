import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthSession } from '../domain/auth-session';
import { InvalidCredentialsError } from '../domain/errors';
import { Login } from '../domain/login';
import { AccessTokenService } from '../domain/ports/access-token-service.port';
import { AuthSessionRepository } from '../domain/ports/auth-session-repository.port';
import { AuthSettings } from '../domain/ports/auth-settings.port';
import { Clock } from '../domain/ports/clock.port';
import { PasswordHasher } from '../domain/ports/password-hasher.port';
import { RefreshTokenFactory } from '../domain/ports/refresh-token-factory.port';
import { UserRepository } from '../domain/ports/user-repository.port';
import type { TokenPair } from '../domain/token-pair';
import type { User } from '../domain/user';

@Injectable()
export class LoginUseCase {
    constructor(
        private readonly users: UserRepository,
        private readonly sessions: AuthSessionRepository,
        private readonly hasher: PasswordHasher,
        private readonly accessTokens: AccessTokenService,
        private readonly refreshTokens: RefreshTokenFactory,
        private readonly clock: Clock,
        private readonly settings: AuthSettings,
    ) {}

    async execute(rawLogin: string, password: string): Promise<TokenPair> {
        const user = await this.findUser(rawLogin);
        if (user === null) {
            await this.hasher.verifyDummy(password);
            throw new InvalidCredentialsError();
        }
        const valid = await this.hasher.verify(user.passwordHash, password);
        if (!valid || !user.canSignIn()) throw new InvalidCredentialsError();

        const now = this.clock.now();
        const issued = this.refreshTokens.issue(
            new Date(now.getTime() + this.settings.refreshTtlMs),
        );
        const session = AuthSession.start({
            id: randomUUID(),
            userId: user.id,
            now,
            firstToken: issued.token,
        });
        await this.sessions.save(session);

        const access = this.accessTokens.sign({
            sub: user.id,
            sid: session.id,
            mcp: user.mustChangePassword,
        });
        return {
            access: access.token,
            expiresIn: access.expiresIn,
            refresh: issued.secret,
            mustChangePassword: user.mustChangePassword,
        };
    }

    private async findUser(rawLogin: string): Promise<User | null> {
        let login: Login;
        try {
            login = Login.of(rawLogin);
        } catch {
            return null;
        }
        return this.users.findByLogin(login);
    }
}
