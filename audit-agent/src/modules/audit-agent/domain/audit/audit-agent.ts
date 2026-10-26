export interface AuditAgentInput {
    query: string;
}

export interface AuditAgentResult {
    query: string;
    answer: string;
}

export abstract class AuditAgent {
    abstract run(input: AuditAgentInput): Promise<AuditAgentResult>;
}
