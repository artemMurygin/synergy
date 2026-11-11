import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createAgent } from 'langchain';
import type {
    AgentCapability,
    AgentCapabilityMode,
    AgentRunContext,
    BuildAgentOptions,
    CapabilityAgent,
} from '../../../../shared/agent-capability';
import { buildTasksAgentPrompt } from './tasks-agent-prompt';
import { createTaskTools, type TaskToolsDeps } from './task-tools';

/** Capability "tasks": create, search and update the tasks of the user the agent talks to. */
export class TasksAgentCapability implements AgentCapability {
    readonly name = 'tasks';

    readonly description =
        'Работа с задачами пользователя: создать задачу, найти задачи, изменить задачу (заголовок, описание, статус, срок, ответственного, наблюдателей) и найти пользователя по имени. Выбирай для любых просьб о задачах и поручениях.';

    readonly mode: AgentCapabilityMode = 'fork';

    constructor(
        private readonly deps: TaskToolsDeps,
        private readonly model: BaseChatModel,
    ) {}

    buildAgent(ctx: AgentRunContext, options?: BuildAgentOptions): CapabilityAgent {
        const tools = Object.values(createTaskTools(this.deps, ctx));
        return createAgent({
            model: this.model,
            tools,
            systemPrompt: buildTasksAgentPrompt(),
            ...(options?.checkpointer === undefined ? {} : { checkpointer: options.checkpointer }),
        });
    }
}
