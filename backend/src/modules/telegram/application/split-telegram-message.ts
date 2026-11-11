export const TELEGRAM_MESSAGE_LIMIT = 4096;

const PARAGRAPH_BREAK = '\n\n';
const LINE_BREAK = '\n';
const ENTITY_START = '&';
const ENTITY_END = ';';
/** Longer than any entity escapeHtml produces (`&amp;`, `&lt;`, `&gt;`): an older `&` is not a cut entity. */
const MAX_ENTITY_LENGTH = 10;
const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;

/**
 * Splits escaped bot HTML into parts of at most `limit` characters: between paragraphs, else
 * between lines, else hard. A hard cut never splits an HTML entity or a surrogate pair. The parts
 * joined give the whole text back; parts of whitespace only are dropped because Telegram rejects them.
 */
export function splitTelegramMessage(html: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
    const parts: string[] = [];
    let rest = html;
    while (rest.length > limit) {
        const cut = cutPosition(rest.slice(0, limit));
        parts.push(rest.slice(0, cut));
        rest = rest.slice(cut);
    }
    parts.push(rest);
    return parts.filter((part) => part.trim().length > 0);
}

function cutPosition(chunk: string): number {
    return breakAfter(chunk, PARAGRAPH_BREAK) ?? breakAfter(chunk, LINE_BREAK) ?? hardCut(chunk);
}

function breakAfter(chunk: string, separator: string): number | null {
    const index = chunk.lastIndexOf(separator);
    return index === -1 ? null : index + separator.length;
}

function hardCut(chunk: string): number {
    const entityStart = chunk.lastIndexOf(ENTITY_START);
    const isEntityCut =
        entityStart > 0 &&
        chunk.length - entityStart < MAX_ENTITY_LENGTH &&
        !chunk.includes(ENTITY_END, entityStart);
    const cut = isEntityCut ? entityStart : chunk.length;
    return isHighSurrogate(chunk.charCodeAt(cut - 1)) && cut > 1 ? cut - 1 : cut;
}

function isHighSurrogate(code: number): boolean {
    return code >= HIGH_SURROGATE_MIN && code <= HIGH_SURROGATE_MAX;
}
