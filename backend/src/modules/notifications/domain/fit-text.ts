import { MAX_NOTIFICATION_TITLE_LENGTH } from './notification-content';

/** Cuts `text` to `max` characters (ellipsis included) without splitting a surrogate pair. */
export function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    let cut = text.slice(0, max - 1);
    const last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
    return `${cut}…`;
}

/** `prefix + title + suffix` that fits the notification title limit; only the title is cut. */
export function fitTitle(prefix: string, title: string, suffix = ''): string {
    const room = MAX_NOTIFICATION_TITLE_LENGTH - prefix.length - suffix.length;
    return `${prefix}${truncate(title, room)}${suffix}`;
}
