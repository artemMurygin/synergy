export abstract class TasksSettings {
    abstract readonly maxFileSizeBytes: number;
    abstract readonly maxFilesPerTask: number;
    abstract readonly downloadLinkTtlSec: number;
}
