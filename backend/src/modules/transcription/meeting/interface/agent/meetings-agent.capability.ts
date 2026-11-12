import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createAgent } from 'langchain';
import type {
    AgentCapability,
    AgentCapabilityMode,
    AgentRunContext,
    BuildAgentOptions,
    CapabilityAgent,
} from '../../../../../shared/agent-capability';
import { createMeetingTools, type MeetingToolsDeps } from './meeting-tools';
import { buildMeetingsAgentPrompt } from './meetings-agent-prompt';

/**
 * Возможность «meetings»: расшифровки записей встреч, имена спикеров и задачи из встречи.
 * Режим `fork`: специалисту нужна история чата со вложениями и сообщениями системы.
 */
export class MeetingsAgentCapability implements AgentCapability {
    readonly name = 'meetings';

    readonly description =
        'Записи встреч и их расшифровки: принять запись встречи из чата, выдать документ расшифровки, показать спикеров и их реплики, назначить имена спикерам, извлечь задачи из встречи, повторить неудавшуюся расшифровку. Выбирай для любых сообщений с записью встречи и вопросов о расшифровке, спикерах и задачах из встречи.';

    readonly mode: AgentCapabilityMode = 'fork';

    constructor(
        private readonly deps: MeetingToolsDeps,
        private readonly model: BaseChatModel,
    ) {}

    buildAgent(ctx: AgentRunContext, options?: BuildAgentOptions): CapabilityAgent {
        return createAgent({
            model: this.model,
            tools: Object.values(createMeetingTools(this.deps, ctx)),
            systemPrompt: buildMeetingsAgentPrompt(),
            ...(options?.checkpointer === undefined ? {} : { checkpointer: options.checkpointer }),
        });
    }
}
