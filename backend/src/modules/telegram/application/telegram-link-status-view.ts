import type { TelegramLink } from '../domain/telegram-link';

export type TelegramLinkStatusView =
    | { readonly isAvailable: boolean; readonly isLinked: false }
    | {
          readonly isAvailable: boolean;
          readonly isLinked: true;
          readonly username: string | null;
          readonly notificationsEnabled: boolean;
          readonly linkedAt: Date;
      };

export function toTelegramLinkStatusView(
    isAvailable: boolean,
    link: TelegramLink | null,
): TelegramLinkStatusView {
    if (link === null) return { isAvailable, isLinked: false };
    return {
        isAvailable,
        isLinked: true,
        username: link.username,
        notificationsEnabled: link.notificationsEnabled,
        linkedAt: link.linkedAt,
    };
}
