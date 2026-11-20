const HTML_ESCAPES: ReadonlyMap<string, string> = new Map([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
]);
const HTML_SPECIAL_CHARACTERS = /[&<>]/g;
const HTML_UNESCAPES: ReadonlyMap<string, string> = new Map(
    [...HTML_ESCAPES].map(([character, entity]) => [entity, character]),
);
const HTML_ENTITIES = /&(?:amp|lt|gt);/g;

const LINKED_COMMANDS = [
    '/new — начать новый диалог',
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

/** Reverses `escapeHtml`: the text of a part sent without HTML parsing. */
export function unescapeHtml(html: string): string {
    return html.replace(HTML_ENTITIES, (entity) => HTML_UNESCAPES.get(entity) ?? entity);
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
    voiceTooLong: (): string =>
        'Голосовое длиннее 3 минут, такое я не расшифрую. Запишите покороче или напишите текстом.',
    voiceTooLarge: (): string =>
        'Файл голосового больше 5 МБ, такой я не расшифрую. Запишите покороче или напишите текстом.',
    voiceNoSpeech: (): string =>
        'В голосовом не удалось разобрать речь. Повторите, пожалуйста, или напишите текстом.',
    voiceUnavailable: (): string =>
        'Голосовые сейчас не обрабатываются. Напишите, пожалуйста, текстом.',
    stillProcessing: (): string =>
        'Ещё обрабатываю предыдущее сообщение. Дождитесь ответа и отправьте это снова.',
    unsupportedMessage: (): string =>
        'Я понимаю только текст и голосовые сообщения. Напишите или запишите голосовое.',
    agentFailed: (): string => 'Не удалось обработать сообщение. Попробуйте отправить его ещё раз.',
    dialogReset: (): string => 'Начали новый диалог. О чём говорили раньше, я больше не помню.',
} as const;
