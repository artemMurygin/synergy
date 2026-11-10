import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FindActiveUserUseCase } from '../../../auth/application/find-active-user.use-case';
import { UserDirectoryPort, type DirectoryUser } from '../../application/ports/user-directory.port';

const uuidSchema = z.guid();

@Injectable()
export class UserDirectory extends UserDirectoryPort {
    constructor(private readonly findActiveUser: FindActiveUserUseCase) {
        super();
    }

    async findActiveById(userId: string): Promise<DirectoryUser | null> {
        if (!uuidSchema.safeParse(userId).success) return null;
        return this.findActiveUser.execute(userId);
    }
}
