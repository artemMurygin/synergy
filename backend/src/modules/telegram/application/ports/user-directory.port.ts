export interface DirectoryUser {
    readonly id: string;
    readonly login: string;
}

export abstract class UserDirectoryPort {
    abstract findActiveById(userId: string): Promise<DirectoryUser | null>;
}
