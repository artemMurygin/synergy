export abstract class SyncCursorRepositoryPort {
    abstract get(projectId: string): Promise<Date | null>;

    abstract set(projectId: string, syncedAt: Date): Promise<void>;
}
