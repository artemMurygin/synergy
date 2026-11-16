import { ValueObject } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';

export interface CallSummaryProps {
    callId: number;
    summaryTitle: string;
    summaryText: string;
}

export class CallSummary extends ValueObject<CallSummaryProps> {
    constructor(props: CallSummaryProps) {
        super(props);
        Object.freeze(this);
    }

    get callId(): number {
        return this.props.callId;
    }

    get summaryTitle(): string {
        return this.props.summaryTitle;
    }

    get summaryText(): string {
        return this.props.summaryText;
    }

    protected validate({ summaryTitle }: CallSummaryProps): void {
        if (summaryTitle.trim() === '') {
            throw new ArgumentInvalidError('Call summary title must not be blank');
        }
    }
}
