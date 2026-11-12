/** RFC 5987 attr-char: encodeURIComponent leaves `'()*` unescaped, which are not allowed there. */
function encodeRfc5987(value: string): string {
    return encodeURIComponent(value).replace(
        /['()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

/** `attachment` disposition with an ASCII fallback and the exact UTF-8 name in `filename*`. */
export function attachmentDisposition(fileName: string): string {
    const fallback = fileName.replace(/[^\x20-\x7e]|["\\%]/g, '_');
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
}
