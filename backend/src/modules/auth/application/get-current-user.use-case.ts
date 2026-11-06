import { Injectable } from '@nestjs/common';
import { InvalidCredentialsError } from '../domain/errors';
import { UserRepository } from '../domain/ports/user-repository.port';

export interface CurrentUser {
    id: string;
    login: string;
    mustChangePassword: boolean;
}

@Injectable()
export class GetCurrentUserUseCase {
    constructor(private readonly users: UserRepository) {}

    async execute(userId: string): Promise<CurrentUser> {
        const user = await this.users.findById(userId);
        if (user?.canSignIn() !== true) throw new InvalidCredentialsError();
        return {
            id: user.id,
            login: user.login.value,
            mustChangePassword: user.mustChangePassword,
        };
    }
}
