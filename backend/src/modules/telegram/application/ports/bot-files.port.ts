export interface BotFile {
    readonly filePath: string;
    readonly fileSize: number | null;
}

/** Files that users sent to the bot, such as voice messages. */
export abstract class BotFilesPort {
    /** Resolves a Telegram `file_id` to a download path. */
    abstract getFile(fileId: string): Promise<BotFile>;

    /** Downloads a file by the path from `getFile`. */
    abstract downloadFile(filePath: string): Promise<Buffer>;
}
