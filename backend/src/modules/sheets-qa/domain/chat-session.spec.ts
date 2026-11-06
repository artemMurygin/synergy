import { describe, expect, it } from 'vitest';
import { ChatMessage } from './chat-message';
import { ChatRole } from './chat-role';
import { ChatSession } from './chat-session';
import { ChatSessionNotFoundError } from './chat-session-not-found.error';
import { ChatTitle } from './chat-title';

const NOW = new Date('2026-01-01T10:00:00Z');

describe('ChatSession', () => {
    it('create() without a title uses the default, not custom', () => {
        const s = ChatSession.create(undefined, NOW);
        expect(s.title.isDefault()).toBe(true);
        expect(s.titleIsCustom).toBe(false);
        expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(s.createdAt).toEqual(NOW);
        expect(s.lastActivityAt).toEqual(NOW);
    });

    it('create() with an explicit title marks it custom', () => {
        const s = ChatSession.create(ChatTitle.of('Цены на МВА'), NOW);
        expect(s.title.value).toBe('Цены на МВА');
        expect(s.titleIsCustom).toBe(true);
    });

    it('rename() sets the title as custom and keeps lastActivityAt', () => {
        const s = ChatSession.create(undefined, NOW).rename(ChatTitle.of('Новое'));
        expect(s.title.value).toBe('Новое');
        expect(s.titleIsCustom).toBe(true);
        expect(s.lastActivityAt).toEqual(NOW);
    });

    it('proposeAutoTitle() names a default-titled session from the first question', () => {
        const s = ChatSession.create(undefined, NOW);
        expect(s.proposeAutoTitle('Сколько стоит МВА?')?.value).toBe('Сколько стоит МВА?');
    });

    it('proposeAutoTitle() never overrides an explicit title', () => {
        const s = ChatSession.create(ChatTitle.of('Цены на МВА'), NOW);
        expect(s.proposeAutoTitle('другой вопрос')).toBeUndefined();
        const renamed = ChatSession.create(undefined, NOW).rename(ChatTitle.of('Мой чат'));
        expect(renamed.proposeAutoTitle('вопрос')).toBeUndefined();
    });

    it('proposeAutoTitle() does nothing once the session was auto-titled', () => {
        const s = ChatSession.restore({
            id: 'x',
            title: ChatTitle.of('Первый вопрос'),
            titleIsCustom: false,
            createdAt: NOW,
            lastActivityAt: NOW,
        });
        expect(s.proposeAutoTitle('второй')).toBeUndefined();
    });
});

describe('ChatRole', () => {
    it('accepts user and agent only', () => {
        expect(ChatRole.parse('user')).toBe('user');
        expect(ChatRole.parse('agent')).toBe('agent');
        expect(() => ChatRole.parse('bot')).toThrow();
    });
});

describe('ChatMessage', () => {
    it('user message has no toolCalls and durationMs', () => {
        const m = ChatMessage.user({ id: 1, sessionId: 's', text: 'q', createdAt: NOW });
        expect(m.role).toBe('user');
        expect(m.toolCalls).toBeNull();
        expect(m.durationMs).toBeNull();
    });

    it('agent message carries toolCalls and durationMs', () => {
        const m = ChatMessage.agent({
            id: 2,
            sessionId: 's',
            text: 'a',
            toolCalls: [{ name: 'search', args: { q: 1 } }],
            durationMs: 1200,
            createdAt: NOW,
        });
        expect(m.role).toBe('agent');
        expect(m.toolCalls).toEqual([{ name: 'search', args: { q: 1 } }]);
        expect(m.durationMs).toBe(1200);
    });

    it('restore() rejects toolCalls/durationMs on a user message', () => {
        expect(() =>
            ChatMessage.restore({
                id: 1,
                sessionId: 's',
                role: 'user',
                text: 'q',
                toolCalls: [],
                durationMs: 5,
                createdAt: NOW,
            }),
        ).toThrow();
    });
});

describe('ChatSessionNotFoundError', () => {
    it('carries the session id', () => {
        const e = new ChatSessionNotFoundError('abc');
        expect(e).toBeInstanceOf(Error);
        expect(e.sessionId).toBe('abc');
        expect(e.message).toContain('abc');
    });
});
