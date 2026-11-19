export interface AttachmentDownloadTokenSigned {
    token: string;
    expiresAt: Date;
}

export abstract class AttachmentDownloadTokenPort {
    /** Бросает TaskAttachmentLinksUnavailableError, если секрет ссылок не задан. */
    abstract sign(attachmentId: string, ttlSec: number): AttachmentDownloadTokenSigned;
    /** false для просроченного, чужого, подделанного токена и токена с другим aud. */
    abstract verify(token: string, attachmentId: string): boolean;
}
