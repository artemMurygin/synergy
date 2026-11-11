import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createDeepAgent } from 'deepagents';
import type {
    AgentCapability,
    AgentCapabilityMode,
    AgentRunContext,
    BuildAgentOptions,
    CapabilityAgent,
} from '../../../shared/agent-capability';
import { createSheetTools } from '../application/sheet-tools.factory';
import type { BookLibraryPort } from '../domain/ports/book-library.port';
import type { Searcher } from '../sheets-qa.config';
import { buildLevelSubagents } from './sheets-qa-subagents';
import { buildSheetsQaSystemPrompt } from './sheets-qa-system-prompt';

export interface SheetsQaAgentCapabilityOptions {
    readonly model: BaseChatModel;
    readonly subagentModel: BaseChatModel;
    readonly library: BookLibraryPort;
    /** Content of `catalog.md`, read once at startup. */
    readonly catalog: string;
    readonly levels: readonly Searcher[];
    readonly maxAnswerChars: number;
}

/** Price-policy specialist: a nested deep agent with level subagents, isolated from the chat history. */
export class SheetsQaAgentCapability implements AgentCapability {
    readonly name = 'sheets_qa';

    readonly description =
        'Специалист по ценовой политике: стоимость обучения, программы, курсы и ДПО, формы обучения, вступительные, сроки. Передавай ему вопросы о ценах и программах одним текстом, без истории чата.';

    readonly mode: AgentCapabilityMode = 'isolated';

    constructor(private readonly options: SheetsQaAgentCapabilityOptions) {}

    // The context and checkpointer are not used: the price agent is stateless and nested.
    buildAgent(_ctx: AgentRunContext, _options?: BuildAgentOptions): CapabilityAgent {
        const { options } = this;
        const tools = createSheetTools(options.library, {
            maxAnswerChars: options.maxAnswerChars,
        });
        return createDeepAgent({
            model: options.model,
            systemPrompt: buildSheetsQaSystemPrompt(
                options.catalog,
                options.levels,
                options.library.list(),
            ),
            tools,
            subagents: buildLevelSubagents(options.levels, tools, options.subagentModel),
        });
    }
}
