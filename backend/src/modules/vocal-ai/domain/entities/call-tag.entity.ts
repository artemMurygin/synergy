import { ValueObject } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';

export interface CallTagProps {
    callId: number;
    tagId: string;
    tagTitle: string;
    value: string;
    valueDescription: string | null;
}

export class CallTag extends ValueObject<CallTagProps> {
    constructor(props: CallTagProps) {
        super(props);
        Object.freeze(this);
    }

    get callId(): number {
        return this.props.callId;
    }

    get tagId(): string {
        return this.props.tagId;
    }

    get tagTitle(): string {
        return this.props.tagTitle;
    }

    get value(): string {
        return this.props.value;
    }

    get valueDescription(): string | null {
        return this.props.valueDescription;
    }

    protected validate({ tagId }: CallTagProps): void {
        if (tagId.trim() === '') {
            throw new ArgumentInvalidError('Call tag tagId must not be blank');
        }
    }
}
