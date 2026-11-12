import { describe, expect, it } from 'vitest';
import { ALLOWED_MEDIA_TYPES, MediaType } from './media-type';
import { UnsupportedMediaTypeError } from './errors';

describe('MediaType', () => {
    it.each([
        ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        ['application/vnd.ms-excel'],
        ['text/csv'],
        ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['application/msword'],
        ['application/pdf'],
        ['text/plain'],
    ])('treats %s as a document', (mime) => {
        const type = MediaType.of(mime);
        expect(type.mime).toBe(mime);
        expect(type.kind).toBe('document');
    });

    it.each([
        ['audio/mpeg'],
        ['audio/mp4'],
        ['audio/x-m4a'],
        ['audio/ogg'],
        ['audio/opus'],
        ['audio/wav'],
        ['audio/x-wav'],
        ['audio/webm'],
        ['video/webm'],
        ['audio/flac'],
        ['audio/x-flac'],
        ['video/mp4'],
    ])('treats %s as a recording', (mime) => {
        expect(MediaType.of(mime).kind).toBe('recording');
    });

    it('normalises case and drops parameters', () => {
        expect(MediaType.of('Text/CSV; charset=utf-8').mime).toBe('text/csv');
    });

    it.each([
        ['application/x-msdownload'],
        ['application/zip'],
        ['application/x-cfb'],
        ['image/png'],
        [''],
    ])('rejects %j outside the allow list', (mime) => {
        expect(() => MediaType.of(mime)).toThrow(UnsupportedMediaTypeError);
    });

    it('reports whether a mime is allowed', () => {
        expect(MediaType.isAllowed('application/pdf')).toBe(true);
        expect(MediaType.isAllowed('image/png')).toBe(false);
    });

    it('exposes every allowed type with its kind', () => {
        expect(ALLOWED_MEDIA_TYPES['application/pdf']).toBe('document');
        expect(ALLOWED_MEDIA_TYPES['video/mp4']).toBe('recording');
    });

    it('compares by mime', () => {
        expect(MediaType.of('text/csv').equals(MediaType.of('TEXT/CSV'))).toBe(true);
        expect(MediaType.of('text/csv').equals(MediaType.of('text/plain'))).toBe(false);
    });
});
