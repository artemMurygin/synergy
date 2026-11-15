export abstract class UserDirectoryPort {
    abstract findLoginById(userId: string): Promise<string | null>;

    /** Full name (last, first, middle name) or the login when the profile has none; null if unknown. */
    abstract findFullNameById(userId: string): Promise<string | null>;

    /** Ids of active users holding the `developer` role. */
    abstract listActiveDeveloperIds(): Promise<string[]>;
}
