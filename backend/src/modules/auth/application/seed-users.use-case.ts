import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Login } from '../domain/login';
import { Clock } from '../domain/ports/clock.port';
import { PasswordGenerator } from '../domain/ports/password-generator.port';
import { PasswordHasher } from '../domain/ports/password-hasher.port';
import { UserRepository } from '../domain/ports/user-repository.port';
import { User } from '../domain/user';

export interface SeedEntry {
    login: string;
    password?: string;
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
        for (const entry of entries) {
            const login = Login.of(entry.login);
            if (await this.users.existsByLogin(login)) {
                result.skipped.push(login.value);
                continue;
            }
            const generated = entry.password === undefined ? this.generator.generate() : undefined;
            const plain = entry.password ?? generated ?? '';
            await this.users.save(
                User.createWithTemporaryPassword({
                    id: randomUUID(),
                    login,
                    passwordHash: await this.hasher.hash(plain),
                    now: this.clock.now(),
                }),
            );
            result.created.push(
                generated === undefined
                    ? { login: login.value }
                    : { login: login.value, generatedPassword: generated },
            );
        }
        return result;
    }
}
