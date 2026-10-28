export const MAX_NOTIFICATION_MESSAGE_LENGTH = 1000;

export const NOTIFY_RESPONSIBLE_RESULTS = {
    QUEUED: 'queued',
    EMPLOYEE_NOT_FOUND: 'employee not found',
} as const;

export type NotifyResponsibleResult =
    (typeof NOTIFY_RESPONSIBLE_RESULTS)[keyof typeof NOTIFY_RESPONSIBLE_RESULTS];

export interface GetUserTelegramAccountByIdTool {
    invoke(id: string): Promise<string>;
}

export interface NotifyResponsibleTool {
    invoke(username: string, message: string): Promise<NotifyResponsibleResult>;
}

export interface AuditTools {
    readonly getUserTelegramAccountById: GetUserTelegramAccountByIdTool;
    readonly notifyResponsible: NotifyResponsibleTool;
}

export interface AuditToolsContext {
    readonly dealId: string;
    readonly dealUpdatedAt: Date;
}
