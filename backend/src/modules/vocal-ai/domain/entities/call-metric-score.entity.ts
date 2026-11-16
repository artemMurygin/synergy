import { ValueObject } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';

export interface CallMetricScoreProps {
    callId: number;
    metricId: string;
    metricTitle: string;
    scoreValue: number;
    maxScore: number;
    reason: string | null;
    recommendations: string | null;
    isException: boolean;
}

export class CallMetricScore extends ValueObject<CallMetricScoreProps> {
    constructor(props: CallMetricScoreProps) {
        super(props);
        Object.freeze(this);
    }

    get callId(): number {
        return this.props.callId;
    }

    get metricId(): string {
        return this.props.metricId;
    }

    get metricTitle(): string {
        return this.props.metricTitle;
    }

    get scoreValue(): number {
        return this.props.scoreValue;
    }

    get maxScore(): number {
        return this.props.maxScore;
    }

    get reason(): string | null {
        return this.props.reason;
    }

    get recommendations(): string | null {
        return this.props.recommendations;
    }

    get isException(): boolean {
        return this.props.isException;
    }

    protected validate({ metricId }: CallMetricScoreProps): void {
        if (metricId.trim() === '') {
            throw new ArgumentInvalidError('Call metric score metricId must not be blank');
        }
    }
}
