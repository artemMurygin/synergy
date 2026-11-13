import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Login } from '../domain/login';
import { Clock } from '../domain/ports/clock.port';
import { PasswordGenerator } from '../domain/ports/password-generator.port';
import { PasswordHasher } from '../domain/ports/password-hasher.port';
import { UserRepository } from '../domain/ports/user-repository.port';
import { Role } from '../domain/role';
import { User } from '../domain/user';

export interface SeedEntry {
    login: string;
    password?: string;
    /** Raw role names; an unknown one aborts the run before anything is written. */
    roles?: string[];
}

export interface SeedResult {
    created: { login: string; generatedPassword?: string }[];
    skipped: string[];
}

@Injectable()
export class SeedUsersUseCase {
    constructor(
        private readonly users: UserRepository,
        private readonly hasher: PasswordHasher,
        private readonly generator: PasswordGenerator,
        private readonly clock: Clock,
    ) {}

    async execute(entries: SeedEntry[]): Promise<SeedResult> {
        const result: SeedResult = { created: [], skipped: [] };
        const parsed = entries.map((entry) => ({
            entry,
            login: Login.of(entry.login),
            roles: (entry.roles ?? []).map((role) => Role.of(role)),
        }));
        for (const { entry, login, roles } of parsed) {
            const existing = await this.users.findByLogin(login);
            if (existing !== null) {
                result.skipped.push(login.value);
                await this.grant(existing.id, roles);
                continue;
            }
            const generated = entry.password === undefined ? this.generator.generate() : undefined;
            const plain = entry.password ?? generated ?? '';
            const user = User.createWithTemporaryPassword({
                id: randomUUID(),
                login,
                passwordHash: await this.hasher.hash(plain),
                now: this.clock.now(),
            });
            await this.users.save(user);
            await this.grant(user.id, roles);
            result.created.push(
                generated === undefined
                    ? { login: login.value }
                    : { login: login.value, generatedPassword: generated },
            );
        }
        return result;
    }

    private async grant(userId: string, roles: Role[]): Promise<void> {
        if (roles.length > 0) await this.users.assignRoles(userId, roles);
    }
}
