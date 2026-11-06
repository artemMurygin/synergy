/**
 * The quick search form is open in a chat without agent answers, and collapsed in a chat
 * with answers unless the user asked for a new search at the current answer count.
 */
export function isFormOpen(agentCount: number, openedAt: number): boolean {
  return agentCount === 0 || openedAt === agentCount
}
