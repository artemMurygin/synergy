export abstract class AdminLock {
    /** Takes the global admin lock inside the current transaction; released when it ends. */
    abstract acquire(): Promise<void>;
}
