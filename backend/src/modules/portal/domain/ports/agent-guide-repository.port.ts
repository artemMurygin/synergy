import type { AgentGuide } from '../agent-guide';

export abstract class AgentGuideRepository {
    /** `INSERT … ON CONFLICT (agent_id) DO UPDATE`: последняя запись побеждает. */
    abstract upsert(guide: AgentGuide): Promise<void>;
    /** Идемпотентно: отсутствие строки не ошибка. */
    abstract delete(agentId: string): Promise<void>;
}
