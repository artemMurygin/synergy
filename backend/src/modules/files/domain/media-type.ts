import { UnsupportedMediaTypeError } from './errors';
import type { FileKind } from './file-kind';

/** Белый список типов и вид файла для каждого. Синонимы — как их отдают браузеры и `file-type`. */
export const ALLOWED_MEDIA_TYPES: Readonly<Record<string, FileKind>> = Object.freeze({
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
    'application/vnd.ms-excel': 'document',
    'text/csv': 'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
    'application/msword': 'document',
    'application/pdf': 'document',
    'text/plain': 'document',
    'audio/mpeg': 'recording',
    'audio/mp4': 'recording',
    'audio/x-m4a': 'recording',
    'audio/ogg': 'recording',
    'audio/opus': 'recording',
    'audio/wav': 'recording',
    'audio/x-wav': 'recording',
    'audio/vnd.wave': 'recording',
    'audio/webm': 'recording',
    'video/webm': 'recording',
    'audio/flac': 'recording',
    'audio/x-flac': 'recording',
    'video/mp4': 'recording',
});

/** Допустимый тип содержимого; `kind` выводится из `mime`. */
export class MediaType {
    private constructor(
        readonly mime: string,
        readonly kind: FileKind,
    ) {
        Object.freeze(this);
    }

    static of(raw: string): MediaType {
        const mime = normalize(raw);
        const kind = Object.hasOwn(ALLOWED_MEDIA_TYPES, mime)
            ? ALLOWED_MEDIA_TYPES[mime]
            : undefined;
        if (kind === undefined) {
            throw new UnsupportedMediaTypeError(mime.length > 0 ? mime : null);
        }
        return new MediaType(mime, kind);
    }

    static isAllowed(raw: string): boolean {
        return Object.hasOwn(ALLOWED_MEDIA_TYPES, normalize(raw));
    }

    equals(other: MediaType): boolean {
        return this.mime === other.mime;
    }
}

function normalize(raw: string): string {
    return (raw.split(';')[0] ?? '').trim().toLowerCase();
}
