import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { IssuedLinkToken } from '../../application/issue-link-token.use-case';
import type { TelegramLinkStatusView } from '../../application/telegram-link-status-view';

export class TelegramLinkStatusResponse {
    @ApiProperty({ description: 'false when the bot is not configured or updates are off' })
    readonly isAvailable: boolean;

    @ApiProperty()
    readonly isLinked: boolean;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        example: 'ivanov_tg',
        description: 'Only when linked',
    })
    readonly username?: string | null;

    @ApiPropertyOptional({ description: 'Only when linked' })
    readonly notificationsEnabled?: boolean;

    @ApiPropertyOptional({ example: '2026-11-06T10:00:00.000Z', description: 'Only when linked' })
    readonly linkedAt?: string;

    constructor(view: TelegramLinkStatusView) {
        this.isAvailable = view.isAvailable;
        this.isLinked = view.isLinked;
        if (view.isLinked) {
            this.username = view.username;
            this.notificationsEnabled = view.notificationsEnabled;
            this.linkedAt = view.linkedAt.toISOString();
        }
    }
}

export class TelegramLinkTokenResponse {
    @ApiProperty({ example: 'https://t.me/synergy_bot?start=Zx8kQ2pLm4Nv7Rt1Yb6Hc3Jd9Fs5Wa0E' })
    readonly url: string;

    @ApiProperty({ example: '2026-11-06T10:10:00.000Z' })
    readonly expiresAt: string;

    constructor(issued: IssuedLinkToken) {
        this.url = issued.url;
        this.expiresAt = issued.expiresAt.toISOString();
    }
}
