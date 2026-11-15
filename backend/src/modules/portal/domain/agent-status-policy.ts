import { AGENT_STATUS_LABELS } from '../contracts/agent-status-labels';
import type { SkillStatus } from './skill-status';

export type AgentStatusCode = 'working' | 'in_development';

export interface AgentStatus {
    readonly code: AgentStatusCode;
    readonly label: string;
}

export interface AgentStatusSkill {
    readonly status: SkillStatus;
    readonly launchedAt: Date | null;
}

/** Единственное место правила вывода статуса агента: работает, если хоть один навык запускался. */
export const AgentStatusPolicy = {
    statusOf(skills: readonly AgentStatusSkill[]): AgentStatus {
        const code: AgentStatusCode = skills.some((skill) => skill.launchedAt !== null)
            ? 'working'
            : 'in_development';
        return { code, label: AGENT_STATUS_LABELS[code] };
    },
};
