import { Injectable } from '@nestjs/common';
import { InvalidCredentialsError } from '../domain/errors';
import type { Role } from '../domain/role';
import { UserRepository } from '../domain/ports/user-repository.port';

export interface CurrentUser {
    id: string;
    login: string;
    mustChangePassword: boolean;
    roles: Role[];
}

@Injectable()
export class GetCurrentUserUseCase {
    constructor(private readonly users: UserRepository) {}

    async execute(userId: string, roles: Role[]): Promise<CurrentUser> {
        const user = await this.users.findById(userId);
        if (user?.canSignIn() !== true) throw new InvalidCredentialsError();
        return {
            id: user.id,
            login: user.login.value,
            mustChangePassword: user.mustChangePassword,
            roles,
        };
    }
}
