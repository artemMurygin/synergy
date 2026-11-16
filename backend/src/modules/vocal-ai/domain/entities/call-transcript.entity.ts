import { Entity } from '../../../../shared/ddd';
import { InvalidCallTranscriptError } from '../errors';
import { CallId } from '../value-objects/call-id.value-object';
import type { CallTranscriptLine } from './call-transcript-line.entity';

export interface CallTranscriptProps {
    lines: CallTranscriptLine[];
}

export interface CreateCallTranscriptProps {
    callId: CallId;
    lines: CallTranscriptLine[];
}

export class CallTranscript extends Entity<CallTranscriptProps> {
    static create({ callId, lines }: CreateCallTranscriptProps): CallTranscript {
        return new CallTranscript({ id: String(callId.value), props: { lines: [...lines] } });
    }

    get callId(): CallId {
        return new CallId(Number(this.id));
    }

    get lines(): readonly CallTranscriptLine[] {
        return this.props.lines;
    }

    validate(): void {
        this.props.lines.forEach((line, position) => {
            if (line.lineIndex !== position) {
                throw new InvalidCallTranscriptError(
                    'Call transcript lines must have a monotonically increasing lineIndex without gaps',
                );
            }
        });
    }
}
