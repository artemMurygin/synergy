import type { AgentStatusCode } from '../domain/agent-status-policy';

/** Русские названия выведенного статуса агента. */
export const AGENT_STATUS_LABELS: Readonly<Record<AgentStatusCode, string>> = {
    working: 'Работает',
    in_development: 'В разработке',
};
