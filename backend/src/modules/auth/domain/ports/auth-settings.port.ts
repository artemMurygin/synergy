export abstract class AuthSettings {
    abstract readonly refreshTtlMs: number;
    abstract readonly refreshGraceMs: number;
}
