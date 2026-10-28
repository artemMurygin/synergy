import { ValueObject } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';

export interface NotificationJobProps {
    username: string;
    message: string;
    dedupeKey?: string;
}

export class NotificationJob extends ValueObject<NotificationJobProps> {
    constructor(props: NotificationJobProps) {
        super({ username: props.username, message: props.message, dedupeKey: props.dedupeKey });
        Object.freeze(this);
    }

    get username(): string {
        return this.props.username;
    }

    get message(): string {
        return this.props.message;
    }

    get dedupeKey(): string | undefined {
        return this.props.dedupeKey;
    }

    protected validate({ username, message }: NotificationJobProps): void {
        if (username.trim() === '' || message.trim() === '') {
            throw new ArgumentInvalidError('Notification username and message must not be blank');
        }
    }
}
