import { ArgumentInvalidError } from '../errors';

export interface AgentRunContextProps {
    readonly userId: string;
    readonly threadId: string;
}

/** Immutable context of one agent run, passed to capability factories and their tools. */
export class AgentRunContext {
    readonly userId: string;

    readonly threadId: string;

    private constructor(props: AgentRunContextProps) {
        this.userId = props.userId;
        this.threadId = props.threadId;
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
