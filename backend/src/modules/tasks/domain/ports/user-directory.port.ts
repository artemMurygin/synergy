export interface DirectoryUser {
    id: string;
    login: string;
}

export abstract class UserDirectory {
    /** Returns only existing active users among the given ids. */
    abstract findActiveByIds(ids: readonly string[]): Promise<DirectoryUser[]>;

    /**
     * Active users whose login contains the query (case-insensitive), at most `limit`.
     * A blank query finds nobody.
     */
    abstract searchActive(query: string, limit: number): Promise<DirectoryUser[]>;
}
