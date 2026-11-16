import { ValueObject } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';

export interface SyncWindowProps {
    fromAt: Date;
    toAt: Date;
}

export class SyncWindow extends ValueObject<SyncWindowProps> {
    constructor(props: SyncWindowProps) {
        super({ fromAt: new Date(props.fromAt), toAt: new Date(props.toAt) });
        Object.freeze(this);
    }

    get fromAt(): Date {
        return new Date(this.props.fromAt);
    }

    get toAt(): Date {
        return new Date(this.props.toAt);
    }

    protected validate({ fromAt, toAt }: SyncWindowProps): void {
        if (Number.isNaN(fromAt.getTime()) || Number.isNaN(toAt.getTime())) {
            throw new ArgumentInvalidError('Sync window dates must be valid');
        }
        if (fromAt.getTime() >= toAt.getTime()) {
            throw new ArgumentInvalidError('Sync window fromAt must be before toAt');
        }
    }
}
