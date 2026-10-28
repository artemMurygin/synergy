export abstract class SyncCursorRepositoryPort {
    abstract get(): Promise<Date | null>;

    abstract set(value: Date): Promise<void>;
}
