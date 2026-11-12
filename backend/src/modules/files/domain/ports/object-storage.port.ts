import type { Readable } from 'node:stream';

export interface PutObjectOptions {
    key: string;
    contentType: string;
    maxBytes: number;
}

export abstract class ObjectStoragePort {
    /**
     * Потоком кладёт содержимое под ключом `key`.
     * Сверх `maxBytes` бросает FileTooLargeError и не оставляет объекта.
     */
    abstract put(stream: Readable, options: PutObjectOptions): Promise<{ sizeBytes: number }>;
    abstract get(key: string): Promise<Readable | null>;
    /** Удаляет объект; отсутствие объекта — не ошибка. */
    abstract delete(key: string): Promise<void>;
    abstract ensureBucket(): Promise<void>;
}
