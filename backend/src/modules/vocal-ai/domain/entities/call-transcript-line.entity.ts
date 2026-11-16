import { ValueObject } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';

export type CallTranscriptSpeakerRole = 'manager' | 'client';

export interface CallTranscriptLineProps {
    callId: number;
    lineIndex: number;
    speakerName: string;
    speakerRole: CallTranscriptSpeakerRole;
    startTimeSeconds: number;
    endTimeSeconds: number;
    text: string;
}

export class CallTranscriptLine extends ValueObject<CallTranscriptLineProps> {
    constructor(props: CallTranscriptLineProps) {
        super(props);
        Object.freeze(this);
    }

    get callId(): number {
        return this.props.callId;
    }

    get lineIndex(): number {
        return this.props.lineIndex;
    }

    get speakerName(): string {
        return this.props.speakerName;
    }

    get speakerRole(): CallTranscriptSpeakerRole {
        return this.props.speakerRole;
    }

    get startTimeSeconds(): number {
        return this.props.startTimeSeconds;
    }

    get endTimeSeconds(): number {
        return this.props.endTimeSeconds;
    }

    get text(): string {
        return this.props.text;
    }

    protected validate({ lineIndex }: CallTranscriptLineProps): void {
        if (!Number.isInteger(lineIndex) || lineIndex < 0) {
            throw new ArgumentInvalidError(
                'Call transcript line lineIndex must be a non-negative integer',
            );
        }
    }
}
