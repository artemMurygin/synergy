const HTML_ESCAPES: ReadonlyMap<string, string> = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
]);
const HTML_SPECIAL_CHARACTERS = /[&<>]/g;

const LINKED_COMMANDS = [
    '/mute — выключить уведомления',
    '/unmute — включить уведомления',
    '/unlink — отключить аккаунт',
    '/help — список команд',
].join('\n');

export function escapeHtml(text: string): string {
    return text.replace(
        HTML_SPECIAL_CHARACTERS,
        (character) => HTML_ESCAPES.get(character) ?? character,
    );
}

export const BotReplies = {
    linked: (login: string): string =>
        `Аккаунт ${escapeHtml(login)} подключён. Сюда будут приходить уведомления о задачах.\n\n${LINKED_COMMANDS}`,
    unlinked: (): string => 'Аккаунт отключён',
    notLinked: (): string =>
        'Аккаунт не подключён. Откройте control-center или manager-helper, раздел «Telegram», и нажмите «Подключить».',
    invalidLinkToken: (): string =>
        'Ссылка недействительна или устарела. Выпустите новую в control-center или manager-helper, раздел «Telegram».',
    accountTaken: (): string =>
        'Этот Telegram уже подключён к другой учётной записи. Сначала отвяжите его там командой /unlink или в приложении.',
    help: (login: string): string =>
        `Аккаунт ${escapeHtml(login)} подключён.\n\nДоступные команды:\n${LINKED_COMMANDS}`,
    notificationsDisabled: (): string => 'Уведомления выключены. Включить снова: /unmute',
    notificationsEnabled: (): string => 'Уведомления включены. Выключить: /mute',
} as const;
