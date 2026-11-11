export const AGENT_PROFILE_IDS = ['app', 'telegram'] as const;

/** Selects which agent is assembled for a client. */
export type AgentProfileId = (typeof AGENT_PROFILE_IDS)[number];
