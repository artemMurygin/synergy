import { MemorySaver } from '@langchain/langgraph';
import { fakeModel } from '@langchain/core/testing';
import { createDeepAgent } from 'deepagents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunContext } from '../../../shared/agent-capability';
import type { BookLibraryPort } from '../domain/ports/book-library.port';
import { SEARCHERS } from '../sheets-qa.config';
import { SheetsQaAgentCapability } from './sheets-qa-agent-capability';

vi.mock('deepagents', () => ({
    createDeepAgent: vi.fn(() => ({ marker: 'deep-agent' })),
}));

const ctx = AgentRunContext.create({ userId: 'user-1', threadId: 'thread-1' });

describe('SheetsQaAgentCapability', () => {
    const model = fakeModel();
    const subagentModel = fakeModel();
    const library = {
        list: () => [{ id: 'ЦП', description: 'главный прайс' }],
        defaultBook: 'ЦП',
    } as unknown as BookLibraryPort;

    function create(): SheetsQaAgentCapability {
        return new SheetsQaAgentCapability({
            model,
            subagentModel,
            library,
            catalog: '# каталог-цен',
            levels: SEARCHERS,
            maxAnswerChars: 1000,
        });
    }

    beforeEach(() => {
        vi.mocked(createDeepAgent).mockClear();
    });

    it('has a name, a selection description and the isolated mode', () => {
        const capability = create();
        expect(capability.name).toBe('sheets_qa');
        expect(capability.description).toContain('цен');
        expect(capability.mode).toBe('isolated');
    });

    it('builds a deep agent with the price tools and one subagent per level', () => {
        const agent = create().buildAgent(ctx);

        expect(agent).toEqual({ marker: 'deep-agent' });
        const args = vi.mocked(createDeepAgent).mock.calls[0]?.[0];
        const toolNames = (args?.tools ?? []).map((tool) => (tool as { name: string }).name);
        expect(toolNames).toEqual(
            expect.arrayContaining(['list_books', 'search_cells', 'read_rows', 'find_related']),
        );
        const subagentNames = (args?.subagents ?? []).map((item) => item.name);
        expect(subagentNames).toEqual(SEARCHERS.map((item) => item.agent));
    });

    it('takes models from its options and the prompt from the catalog', () => {
        create().buildAgent(ctx);

        const args = vi.mocked(createDeepAgent).mock.calls[0]?.[0];
        expect(args?.model).toBe(model);
        const subagents = args?.subagents ?? [];
        expect(subagents.length).toBeGreaterThan(0);
        for (const subagent of subagents) {
            expect((subagent as { model?: unknown }).model).toBe(subagentModel);
        }
        expect(JSON.stringify(args?.systemPrompt)).toContain('# каталог-цен');
    });

    it('never uses a checkpointer, even when one is passed', () => {
        create().buildAgent(ctx, { checkpointer: new MemorySaver() });

        const args = vi.mocked(createDeepAgent).mock.calls[0]?.[0];
        expect(args?.checkpointer).toBeUndefined();
    });
});
