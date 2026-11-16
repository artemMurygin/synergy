import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createAgent } from 'langchain';
import type {
    AgentCapability,
    AgentCapabilityMode,
    AgentRunContext,
    BuildAgentOptions,
    CapabilityAgent,
} from '../../../../shared/agent-capability';
import { createVocalAiTools, type VocalAiToolsDeps } from './vocal-ai-tools';

const VOCAL_AI_AGENT_SYSTEM_PROMPT =
    'Работа со звонками VocalAI: найти звонки по фильтру, посмотреть детали и статистику, получить транскрипцию. ' +
    'Все данные берутся из локального хранилища синхронизации, кроме транскрипции, которая может подгружаться лениво. ' +
    'Явно уточняй у пользователя период, менеджера или другие фильтры, если запрос неоднозначен.';

/** Capability "vocal-ai": search звонки, их детали, статистика и транскрипция для пользователя. */
export class VocalAiAgentCapability implements AgentCapability {
    readonly name = 'vocal-ai';

    readonly description =
        'Работа со звонками VocalAI: найти звонки по фильтру (проект, менеджер, период, оценка, тег, метрика), посмотреть детали звонка, получить транскрипцию и агрегированную статистику. Выбирай для любых вопросов о звонках и их анализе.';

    readonly mode: AgentCapabilityMode = 'fork';

    constructor(
        private readonly deps: VocalAiToolsDeps,
        private readonly model: BaseChatModel,
    ) {}

    buildAgent(ctx: AgentRunContext, options?: BuildAgentOptions): CapabilityAgent {
        const tools = Object.values(createVocalAiTools(this.deps, ctx));
        return createAgent({
            model: this.model,
            tools,
            systemPrompt: VOCAL_AI_AGENT_SYSTEM_PROMPT,
            ...(options?.checkpointer === undefined ? {} : { checkpointer: options.checkpointer }),
        });
    }
}
