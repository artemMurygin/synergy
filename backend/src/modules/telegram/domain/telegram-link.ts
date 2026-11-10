import { TelegramIdentityMismatchError } from './errors';
import type { TelegramIdentity } from './telegram-identity';

export interface TelegramLinkProps {
    readonly userId: string;
    readonly identity: TelegramIdentity;
    readonly notificationsEnabled: boolean;
    readonly linkedAt: Date;
    readonly updatedAt: Date;
}

export class TelegramLink {
    readonly userId: string;

    readonly linkedAt: Date;

    private currentIdentity: TelegramIdentity;

    private isNotificationsEnabled: boolean;

    private lastUpdatedAt: Date;

    private constructor(props: TelegramLinkProps) {
        this.userId = props.userId;
        this.linkedAt = props.linkedAt;
        this.currentIdentity = props.identity;
        this.isNotificationsEnabled = props.notificationsEnabled;
        this.lastUpdatedAt = props.updatedAt;
    }

    static link(userId: string, identity: TelegramIdentity, now: Date): TelegramLink {
        return new TelegramLink({
            userId,
            identity,
            notificationsEnabled: true,
            linkedAt: now,
            updatedAt: now,
        });
    }

    static restore(props: TelegramLinkProps): TelegramLink {
        return new TelegramLink(props);
    }

    get identity(): TelegramIdentity {
        return this.currentIdentity;
    }

    get telegramUserId(): bigint {
        return this.currentIdentity.telegramUserId;
    }

    get chatId(): bigint {
        return this.currentIdentity.chatId;
    }

    get username(): string | null {
        return this.currentIdentity.username;
    }

    get notificationsEnabled(): boolean {
        return this.isNotificationsEnabled;
    }

    get updatedAt(): Date {
        return this.lastUpdatedAt;
    }

    relink(identity: TelegramIdentity, now: Date): void {
        if (identity.telegramUserId !== this.currentIdentity.telegramUserId) {
            throw new TelegramIdentityMismatchError();
        }
        this.currentIdentity = identity;
        this.lastUpdatedAt = now;
    }

    enableNotifications(now: Date): void {
        this.isNotificationsEnabled = true;
        this.lastUpdatedAt = now;
    }

    disableNotifications(now: Date): void {
        this.isNotificationsEnabled = false;
        this.lastUpdatedAt = now;
    }
}
