import { describe, expect, it } from 'vitest';
import { BotCommand } from './bot-command';

const BOT = 'synergy_bot';

describe('BotCommand.parse', () => {
    it.each([
        { text: '/start', name: 'start', argument: null },
        { text: '/help', name: 'help', argument: null },
        { text: '/unlink', name: 'unlink', argument: null },
        { text: '/mute', name: 'mute', argument: null },
        { text: '/unmute', name: 'unmute', argument: null },
        { text: '/new', name: 'new', argument: null },
        { text: '/new@synergy_bot', name: 'new', argument: null },
        { text: '  /help  ', name: 'help', argument: null },
    ])('parses "$text"', ({ text, name, argument }) => {
        expect(BotCommand.parse(text, BOT)).toMatchObject({ name, argument });
    });

    it('parses the argument', () => {
        expect(BotCommand.parse('/start abc_DEF-123', BOT)).toMatchObject({
            name: 'start',
            argument: 'abc_DEF-123',
        });
        expect(BotCommand.parse('/start   abc  ', BOT)).toMatchObject({ argument: 'abc' });
    });

    it.each(['/start@synergy_bot', '/start@Synergy_Bot', '/start@synergy_bot token'])(
        'accepts a command addressed to this bot: "%s"',
        (text) => {
            expect(BotCommand.parse(text, BOT)?.name).toBe('start');
        },
    );

    it('accepts the bot username with a leading @', () => {
        expect(BotCommand.parse('/help@synergy_bot', '@synergy_bot')?.name).toBe('help');
    });

    it('keeps the argument of a command addressed to this bot', () => {
        expect(BotCommand.parse('/start@synergy_bot token', BOT)?.argument).toBe('token');
    });

    it.each(['/start@other_bot', '/start@other_bot token'])(
        'ignores a command for another bot: "%s"',
        (text) => {
            expect(BotCommand.parse(text, BOT)).toBeNull();
        },
    );

    it.each([
        '/unknown',
        '/newchat',
        '/startnow',
        '/stop arg',
        'hello',
        'start',
        '',
        '/',
        ' / start',
    ])('returns null for "%s"', (text) => {
        expect(BotCommand.parse(text, BOT)).toBeNull();
    });
});
