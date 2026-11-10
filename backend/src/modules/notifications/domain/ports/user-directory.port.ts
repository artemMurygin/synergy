export abstract class UserDirectoryPort {
    abstract findLoginById(userId: string): Promise<string | null>;
}
