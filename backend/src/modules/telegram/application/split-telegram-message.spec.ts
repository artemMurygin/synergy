import { describe, expect, it } from 'vitest';
import { TELEGRAM_MESSAGE_LIMIT, splitTelegramMessage } from './split-telegram-message';

const ENTITY = /&[a-z]+;/g;

function expectWithinLimit(parts: readonly string[], limit: number): void {
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(limit);
}

function expectWholeEntities(parts: readonly string[]): void {
    for (const part of parts) {
        const withoutEntities = part.replace(ENTITY, '');
        expect(withoutEntities).not.toMatch(/&/);
    }
}

describe('splitTelegramMessage', () => {
    it('uses the Telegram limit of 4096 characters by default', () => {
        expect(TELEGRAM_MESSAGE_LIMIT).toBe(4096);
        expect(splitTelegramMessage('a'.repeat(4096))).toEqual(['a'.repeat(4096)]);
        expect(splitTelegramMessage('a'.repeat(4097))).toHaveLength(2);
    });

    it('keeps a short answer as one part', () => {
        expect(splitTelegramMessage('Задача создана')).toEqual(['Задача создана']);
    });

    it('returns no parts for an empty or blank answer', () => {
        expect(splitTelegramMessage('')).toEqual([]);
        expect(splitTelegramMessage(' \n\n ')).toEqual([]);
    });

    it('cuts a long answer between paragraphs', () => {
        const first = 'a'.repeat(30);
        const second = 'b\nb'.repeat(10);
        const third = 'c'.repeat(20);
        const html = `${first}\n\n${second}\n\n${third}`;

        const parts = splitTelegramMessage(html, 50);

        expect(parts).toEqual([`${first}\n\n`, `${second}\n\n`, third]);
        expect(parts.join('')).toBe(html);
    });

    it('cuts a paragraph longer than the limit between lines', () => {
        const lines = ['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20)];
        const html = lines.join('\n');

        const parts = splitTelegramMessage(html, 45);

        expect(parts).toEqual([`${lines[0]}\n${lines[1]}\n`, lines[2]]);
        expect(parts.join('')).toBe(html);
    });

    it('cuts a line longer than the limit hard', () => {
        const html = 'x'.repeat(25);

        const parts = splitTelegramMessage(html, 10);

        expect(parts).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
    });

    it('never cuts an HTML entity in two', () => {
        const html = `${'a'.repeat(8)}&amp;${'b'.repeat(8)}`;

        const parts = splitTelegramMessage(html, 10);

        expect(parts.join('')).toBe(html);
        expectWithinLimit(parts, 10);
        expectWholeEntities(parts);
        expect(parts[0]).toBe('a'.repeat(8));
    });

    it('keeps every entity whole in a long escaped answer', () => {
        const html = '&lt;tag&gt; a &amp; b '.repeat(400);

        const parts = splitTelegramMessage(html, 97);

        expect(parts.join('')).toBe(html);
        expectWithinLimit(parts, 97);
        expectWholeEntities(parts);
    });

    it('does not cut a character made of a surrogate pair', () => {
        const html = `${'a'.repeat(9)}😀${'b'.repeat(5)}`;

        const parts = splitTelegramMessage(html, 10);

        expect(parts.join('')).toBe(html);
        expect(parts[0]).toBe('a'.repeat(9));
    });

    it('keeps the whole text of a long real-sized answer', () => {
        const paragraph = `${'Строка ответа агента &amp; детали.\n'.repeat(30)}\n`;
        const html = paragraph.repeat(20);

        const parts = splitTelegramMessage(html);

        expect(parts.length).toBeGreaterThan(1);
        expect(parts.join('')).toBe(html);
        expectWithinLimit(parts, TELEGRAM_MESSAGE_LIMIT);
        expectWholeEntities(parts);
    });
});
