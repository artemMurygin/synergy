import { ArgumentInvalidError } from '../errors';
import { RunAttachments } from './run-attachments';

export interface AgentRunContextProps {
    readonly userId: string;
    readonly threadId: string;
    /** Collector of the files of the answer; a new empty one when not given. */
    readonly attachments?: RunAttachments;
}

/** Immutable context of one agent run, passed to capability factories and their tools. */
export class AgentRunContext {
    readonly userId: string;
    readonly threadId: string;
    /** The collector itself accumulates the files of this run; the reference never changes. */
    readonly attachments: RunAttachments;

    private constructor(props: AgentRunContextProps) {
        this.userId = props.userId;
        this.threadId = props.threadId;
        this.attachments = props.attachments ?? RunAttachments.create();
        Object.freeze(this);
    }

    static create(props: AgentRunContextProps): AgentRunContext {
        if (props.userId.trim() === '') {
            throw new ArgumentInvalidError('AgentRunContext userId must not be empty');
        }
        if (props.threadId.trim() === '') {
            throw new ArgumentInvalidError('AgentRunContext threadId must not be empty');
        }
        return new AgentRunContext(props);
    }
}
