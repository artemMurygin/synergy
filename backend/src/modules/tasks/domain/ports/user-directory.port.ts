export interface DirectoryUser {
    id: string;
    login: string;
}

export abstract class UserDirectory {
    /** Returns only existing active users among the given ids. */
    abstract findActiveByIds(ids: readonly string[]): Promise<DirectoryUser[]>;
}
