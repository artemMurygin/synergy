import { BaseError } from '../../../../shared/errors';

export const TRANSIENT_NOTIFY_ERROR_CODE = 'AUDIT_AGENT.TRANSIENT_NOTIFY_ERROR';
export const PERMANENT_NOTIFY_ERROR_CODE = 'AUDIT_AGENT.PERMANENT_NOTIFY_ERROR';

export class TransientNotifyError extends BaseError {
    readonly code: string = TRANSIENT_NOTIFY_ERROR_CODE;
}

export class PermanentNotifyError extends BaseError {
    readonly code: string = PERMANENT_NOTIFY_ERROR_CODE;
}
