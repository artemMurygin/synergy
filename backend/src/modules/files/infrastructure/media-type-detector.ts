import { extname } from 'node:path';
import { Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { UnsupportedMediaTypeError } from '../domain/errors';
import { MediaType } from '../domain/media-type';

/** Сколько первых байт файла нужно детектору. */
export const MEDIA_TYPE_HEAD_BYTES = 4100;

const CFB_MIME = 'application/x-cfb';

// Тип старых Office-файлов (cfb) — по расширению.
const CFB_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
    '.xls': 'application/vnd.ms-excel',
    '.doc': 'application/msword',
});

// Форматы без сигнатуры: допускаются по расширению, если содержимое — текст в UTF-8.
const TEXT_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
    '.csv': 'text/csv',
    '.txt': 'text/plain',
});

// C0-управляющие символы, кроме \t \n \f \r, и DEL — признак бинарных данных.
// eslint-disable-next-line no-control-regex
const BINARY_CHARS = /[\u0000-\u0008\u000B\u000E-\u001F\u007F]/;

@Injectable()
export class MediaTypeDetector {
    async detect(head: Buffer, fileName: string): Promise<MediaType> {
        const extension = extname(fileName).toLowerCase();
        const detected = await fileTypeFromBuffer(head.subarray(0, MEDIA_TYPE_HEAD_BYTES));

        if (detected === undefined) {
            return detectText(head, extension);
        }
        if (detected.mime === CFB_MIME) {
            const mime = lookup(CFB_BY_EXTENSION, extension);
            if (mime === undefined) {
                throw new UnsupportedMediaTypeError(CFB_MIME);
            }
            return MediaType.of(mime);
        }
        return MediaType.of(detected.mime);
    }
}

function detectText(head: Buffer, extension: string): MediaType {
    const mime = lookup(TEXT_BY_EXTENSION, extension);
    if (mime === undefined || !isUtf8Text(head)) {
        throw new UnsupportedMediaTypeError(null);
    }
    return MediaType.of(mime);
}

function isUtf8Text(head: Buffer): boolean {
    if (head.length === 0) {
        return false;
    }
    let text: string;
    try {
        // stream: true — буфер может обрываться посреди многобайтового символа.
        text = new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true });
    } catch {
        return false;
    }
    return !BINARY_CHARS.test(text);
}

function lookup(table: Readonly<Record<string, string>>, key: string): string | undefined {
    return Object.hasOwn(table, key) ? table[key] : undefined;
}
