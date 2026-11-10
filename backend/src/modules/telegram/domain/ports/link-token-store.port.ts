export abstract class LinkTokenStorePort {
    abstract save(digest: string, userId: string, ttlSeconds: number): Promise<void>;

    abstract consume(digest: string): Promise<string | null>;
}
