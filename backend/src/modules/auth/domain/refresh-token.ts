export interface RefreshToken {
    id: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    replacedById: string | null;
}

export interface NewRefreshToken {
    id: string;
    tokenHash: string;
    expiresAt: Date;
}
