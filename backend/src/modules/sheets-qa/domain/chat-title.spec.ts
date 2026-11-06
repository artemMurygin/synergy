import { describe, expect, it } from 'vitest';
import { ChatTitle, InvalidChatTitleError, MAX_CHAT_TITLE_LENGTH } from './chat-title';

describe('ChatTitle', () => {
    it('trims the value', () => {
        expect(ChatTitle.of('  Цены на МВА  ').value).toBe('Цены на МВА');
    });

    it('accepts 1 and 120 characters', () => {
        expect(ChatTitle.of('a').value).toBe('a');
        expect(ChatTitle.of('a'.repeat(MAX_CHAT_TITLE_LENGTH)).value).toHaveLength(120);
    });

    it('rejects empty and whitespace-only titles', () => {
        expect(() => ChatTitle.of('')).toThrow(InvalidChatTitleError);
        expect(() => ChatTitle.of('   ')).toThrow(InvalidChatTitleError);
    });

    it('rejects titles longer than 120 characters after trim', () => {
        expect(() => ChatTitle.of('a'.repeat(121))).toThrow(InvalidChatTitleError);
        expect(ChatTitle.of(` ${'a'.repeat(120)} `).value).toHaveLength(120);
    });

    it('default() is «Новый чат» and isDefault', () => {
        expect(ChatTitle.default().value).toBe('Новый чат');
        expect(ChatTitle.default().isDefault()).toBe(true);
        expect(ChatTitle.of('Другое').isDefault()).toBe(false);
    });

    it('fromQuestion truncates to about 60 characters with an ellipsis', () => {
        const long = 'в'.repeat(200);
        const title = ChatTitle.fromQuestion(long);
        expect(title.value.length).toBeLessThanOrEqual(61);
        expect(title.value.endsWith('…')).toBe(true);
    });

    it('fromQuestion keeps short questions as is and collapses whitespace', () => {
        expect(ChatTitle.fromQuestion('  сколько \n стоит МВА? ').value).toBe('сколько стоит МВА?');
    });

    it('fromQuestion falls back to the default title for a blank question', () => {
        expect(ChatTitle.fromQuestion('   ').isDefault()).toBe(true);
    });

    it('equals compares by value', () => {
        expect(ChatTitle.of('x').equals(ChatTitle.of(' x '))).toBe(true);
    });
});
