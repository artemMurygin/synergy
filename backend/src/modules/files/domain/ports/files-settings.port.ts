export abstract class FilesSettingsPort {
    abstract readonly maxRecordingBytes: number;
    abstract readonly maxDocumentBytes: number;
    abstract readonly downloadLinkTtlSec: number;
}
