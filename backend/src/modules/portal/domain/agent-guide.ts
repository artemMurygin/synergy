import { GuideBody } from './guide-body';

export interface WriteAgentGuideProps {
    agentId: string;
    body: string;
    by: string;
    now: Date;
}

/** Инструкция агента: одна запись на агента, последняя запись побеждает. */
export class AgentGuide {
    private constructor(
        readonly agentId: string,
        readonly body: GuideBody,
        readonly updatedBy: string,
        readonly updatedAt: Date,
    ) {}

    /** `null` — тело пустое после trim: инструкцию нужно удалить, а не сохранить. */
    static write(props: WriteAgentGuideProps): AgentGuide | null {
        const body = GuideBody.of(props.body);
        if (body === null) return null;
        return new AgentGuide(props.agentId, body, props.by, props.now);
    }
}
