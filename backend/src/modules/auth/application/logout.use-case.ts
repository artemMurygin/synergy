import { Injectable } from '@nestjs/common';
import { AuthSessionRepository } from '../domain/ports/auth-session-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { RefreshTokenFactory } from '../domain/ports/refresh-token-factory.port';
import { TransactionRunner } from '../domain/ports/transaction-runner.port';

@Injectable()
export class LogoutUseCase {
    constructor(
        private readonly sessions: AuthSessionRepository,
        private readonly refreshTokens: RefreshTokenFactory,
        private readonly clock: Clock,
        private readonly tx: TransactionRunner,
    ) {}

    async execute(refreshSecret?: string): Promise<void> {
        if (refreshSecret === undefined || refreshSecret === '') return;
        await this.tx.run(async () => {
            const session = await this.sessions.findByTokenHash(
                this.refreshTokens.hash(refreshSecret),
            );
            if (session === null || session.isRevoked()) return;
            session.revoke(this.clock.now());
            await this.sessions.save(session);
        });
    }
}
