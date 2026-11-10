import { Injectable } from '@nestjs/common';
import { UserRepository } from '../domain/ports/user-repository.port';

export interface ActiveUser {
    readonly id: string;
    readonly login: string;
}

@Injectable()
export class FindActiveUserUseCase {
    constructor(private readonly users: UserRepository) {}

    async execute(userId: string): Promise<ActiveUser | null> {
        const user = await this.users.findById(userId);
        if (user?.isActive !== true) return null;
        return { id: user.id, login: user.login.value };
    }
}
