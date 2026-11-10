export abstract class UpdateDeduplicatorPort {
    abstract markProcessed(updateId: number): Promise<boolean>;
}
