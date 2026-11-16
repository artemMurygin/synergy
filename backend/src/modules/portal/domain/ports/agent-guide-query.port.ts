/** Read-модель инструкции с автором последней правки. */
export interface GuideRecord {
    body: string;
    updatedAt: Date;
    /** ФИО по правилам employee-directory, без ФИО — логин. */
    updatedBy: { id: string; login: string; fullName: string };
}

export abstract class AgentGuideQuery {
    /** `null`, если инструкции нет. */
    abstract find(agentId: string): Promise<GuideRecord | null>;
}
