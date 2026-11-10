import { describe, expect, it } from 'vitest';
import { BotReplies, escapeHtml } from './bot-replies';

const LINKED_COMMANDS = ['/help', '/mute', '/unmute', '/unlink'];

describe('escapeHtml', () => {
    it('escapes &, < and >', () => {
        expect(escapeHtml('a & <b>c</b> > d')).toBe('a &amp; &lt;b&gt;c&lt;/b&gt; &gt; d');
    });

    it('escapes an ampersand before the other entities only once', () => {
        expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    });

    it('keeps plain text unchanged', () => {
        expect(escapeHtml('ivanov_tg "quoted"')).toBe('ivanov_tg "quoted"');
    });
});

describe('BotReplies', () => {
    it('confirms the link with the login and lists the commands', () => {
        const text = BotReplies.linked('ivanov');
        expect(text).toContain('Аккаунт ivanov подключён');
        for (const command of LINKED_COMMANDS) expect(text).toContain(command);
    });

    it('escapes the login in the confirmation', () => {
        expect(BotReplies.linked('<b>&x</b>')).toContain(
            'Аккаунт &lt;b&gt;&amp;x&lt;/b&gt; подключён',
        );
    });

    it('reports the unlink', () => {
        expect(BotReplies.unlinked()).toBe('Аккаунт отключён');
    });

    it('tells an unlinked chat how to connect from the apps', () => {
        const text = BotReplies.notLinked();
        expect(text).toContain('control-center');
        expect(text).toContain('manager-helper');
        expect(text).toContain('«Telegram»');
        expect(text).toContain('«Подключить»');
    });

    it('rejects an invalid link and suggests issuing a new one', () => {
        const text = BotReplies.invalidLinkToken();
        expect(text).toContain('недействительна');
        expect(text).toContain('новую');
    });

    it('explains that the Telegram account belongs to another user', () => {
        const text = BotReplies.accountTaken();
        expect(text).toContain('уже подключён к другой учётной записи');
        expect(text).toContain('отвяжите');
    });

    it('lists the linked commands in the help with the escaped login', () => {
        const text = BotReplies.help('pe<t>rov');
        expect(text).toContain('pe&lt;t&gt;rov');
        for (const command of LINKED_COMMANDS) expect(text).toContain(command);
    });

    it('confirms muting and unmuting', () => {
        expect(BotReplies.notificationsDisabled()).toContain('Уведомления выключены');
        expect(BotReplies.notificationsDisabled()).toContain('/unmute');
        expect(BotReplies.notificationsEnabled()).toContain('Уведомления включены');
        expect(BotReplies.notificationsEnabled()).toContain('/mute');
    });

    it('says free text is not supported yet and lists the commands', () => {
        const text = BotReplies.freeTextNotSupported();
        expect(text).toContain('Текстовые запросы');
        expect(text).toContain('позже');
        for (const command of LINKED_COMMANDS) expect(text).toContain(command);
    });

    it('produces HTML without raw angle brackets outside of tags', () => {
        const texts = [
            BotReplies.linked('ivanov'),
            BotReplies.unlinked(),
            BotReplies.notLinked(),
            BotReplies.invalidLinkToken(),
            BotReplies.accountTaken(),
            BotReplies.help('ivanov'),
            BotReplies.notificationsDisabled(),
            BotReplies.notificationsEnabled(),
            BotReplies.freeTextNotSupported(),
        ];
        for (const text of texts) {
            expect(text.replace(/<\/?b>/g, '')).not.toMatch(/[<>]/);
        }
    });
});
