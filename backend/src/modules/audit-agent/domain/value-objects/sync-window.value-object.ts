import { ValueObject } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';

export interface SyncWindowProps {
    from: Date;
    to: Date;
}

export class SyncWindow extends ValueObject<SyncWindowProps> {
    constructor(props: SyncWindowProps) {
        super({ from: new Date(props.from), to: new Date(props.to) });
        Object.freeze(this);
    }

    get from(): Date {
        return new Date(this.props.from);
    }

    get to(): Date {
        return new Date(this.props.to);
    }

    protected validate({ from, to }: SyncWindowProps): void {
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            throw new ArgumentInvalidError('Sync window dates must be valid');
        }
        if (from.getTime() > to.getTime()) {
            throw new ArgumentInvalidError('Sync window start must not be after its end');
        }
    }
}
