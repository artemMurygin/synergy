import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { AgentCapability, AgentCapabilityMode, BuildAgentOptions } from './agent-capability';
import { AGENT_CAPABILITY_MODES } from './agent-capability';
import { AgentRunContext } from './agent-run-context';

describe('AgentCapability', () => {
    it('supports exactly the isolated and fork modes', () => {
        expect([...AGENT_CAPABILITY_MODES]).toEqual(['isolated', 'fork']);
        expectTypeOf<AgentCapabilityMode>().toEqualTypeOf<'isolated' | 'fork'>();
    });

    it('builds an agent from the run context without a checkpointer', () => {
        const agent = { invoke: vi.fn() };
        const buildAgent = vi.fn(() => agent as never);
        const capability: AgentCapability = {
            name: 'tasks',
            description: 'Works with tasks',
            mode: 'isolated',
            buildAgent,
        };
        const ctx = AgentRunContext.create({ userId: 'u-1', threadId: 't-1' });

        const built = capability.buildAgent(ctx);

        expect(built).toBe(agent);
        expect(buildAgent).toHaveBeenCalledWith(ctx);
    });

    it('passes an optional checkpointer to the factory', () => {
        const checkpointer = {} as BaseCheckpointSaver;
        const buildAgent = vi.fn(() => ({}) as never);
        const capability: AgentCapability = {
            name: 'tasks',
            description: 'Works with tasks',
            mode: 'fork',
            buildAgent,
        };
        const ctx = AgentRunContext.create({ userId: 'u-1', threadId: 't-1' });

        capability.buildAgent(ctx, { checkpointer });

        expect(buildAgent).toHaveBeenCalledWith(ctx, { checkpointer });
    });

    it('declares the factory signature', () => {
        expectTypeOf<AgentCapability['buildAgent']>().parameters.toEqualTypeOf<
            [ctx: AgentRunContext, options?: BuildAgentOptions]
        >();
        expectTypeOf<BuildAgentOptions['checkpointer']>().toEqualTypeOf<
            BaseCheckpointSaver | undefined
        >();
    });
});
