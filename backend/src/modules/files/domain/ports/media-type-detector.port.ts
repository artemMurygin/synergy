import type { MediaType } from '../media-type';

/** Сколько первых байт файла нужно для определения типа. */
export const MEDIA_TYPE_HEAD_BYTES = 4100;

export abstract class MediaTypeDetectorPort {
    /** Бросает UnsupportedMediaTypeError для типа вне белого списка. */
    abstract detect(head: Buffer, fileName: string): Promise<MediaType>;
}
