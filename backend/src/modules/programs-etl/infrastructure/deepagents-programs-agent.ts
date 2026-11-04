import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { tool, toolStrategy } from 'langchain';
import { createDeepAgent } from 'deepagents';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import type { ProgramsSyncErrorCode } from '../application/errors/programs-sync.error';
import { createCatalogMutationPlan } from '../application/models/catalog-mutation';
import type { CatalogMutation, CatalogMutationPlan } from '../application/models/catalog-mutation';
import type { ProgramsGroup } from '../application/models/programs-group';
import type { ChangedSource } from '../application/models/source-fingerprint';
import { createSourceReference } from '../application/models/source-fingerprint';
import type {
    CatalogQueryPort,
    ProgramsAgentPort,
    ProgramsSyncMetricsPort,
    SheetsReaderPort,
} from '../application/ports/programs-etl.ports';
import { createAgentTools } from '../application/tools/agent-tools.factory';
import type { AgentToolLogger } from '../application/tools/agent-tools.factory';
import { mutationPlanSchema, PROGRAMS_AGENT_SYSTEM_PROMPT } from './programs-agent-contract';

/** Tool errors the model can correct itself; everything else fails the run. */
const MODEL_RECOVERABLE_CODES: ReadonlySet<ProgramsSyncErrorCode> = new Set([
    'INVALID_QUERY',
    'SOURCE_NOT_IN_GROUP',
    'INVALID_RANGE',
    'RECORD_NOT_FOUND',
]);

export interface DeepAgentsProgramsAgentOptions {
    /** Builds a chat model for every run, e.g. `new ChatOpenAI({ model })`. */
    readonly modelFactory: (model: string) => BaseChatModel;
    readonly model: string;
    readonly maxSteps: number;
    readonly timeoutMs: number;
    readonly sheetsReader: SheetsReaderPort;
    readonly catalogQuery: CatalogQueryPort;
    readonly logger: AgentToolLogger;
    readonly metrics?: Pick<ProgramsSyncMetricsPort, 'recordToolCall'>;
}

function describeRun(group: ProgramsGroup, changedSources: readonly ChangedSource[]): string {
    const changed = changedSources.map((s) => s.sourceId).join(', ');
    return [
        `Group: ${group.name} (${group.id})`,
        group.note === undefined ? '' : `Note: ${group.note}`,
        `Changed sources: ${changed}`,
        'Read the changed sources and return the mutation plan.',
    ]
        .filter((line) => line.length > 0)
        .join('\n');
}

function isRecursionLimit(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.name === 'GraphRecursionError' || /recursion limit/i.test(error.message))
    );
}

export class DeepAgentsProgramsAgent implements ProgramsAgentPort {
    constructor(private readonly options: DeepAgentsProgramsAgentOptions) {}

    async buildMutationPlan(input: {
        runId: string;
        group: ProgramsGroup;
        changedSources: ChangedSource[];
    }): Promise<CatalogMutationPlan> {
        const { options } = this;
        const toolset = createAgentTools({
            runId: input.runId,
            group: input.group,
            sheetsReader: options.sheetsReader,
            catalogQuery: options.catalogQuery,
            logger: options.logger,
            ...(options.metrics === undefined ? {} : { metrics: options.metrics }),
        });

        let fatal: ProgramsSyncError | undefined;
        const abort = new AbortController();
        const tools = toolset.tools.map((agentTool) =>
            tool(
                async (args: unknown): Promise<string> => {
                    try {
                        return JSON.stringify(await agentTool.execute(args));
                    } catch (error) {
                        if (
                            error instanceof ProgramsSyncError &&
                            MODEL_RECOVERABLE_CODES.has(error.code)
                        ) {
                            return JSON.stringify({
                                error: { code: error.code, message: error.message },
                            });
                        }
                        fatal =
                            error instanceof ProgramsSyncError
                                ? error
                                : new ProgramsSyncError(
                                      'INVALID_WORKFLOW_DATA',
                                      'Agent tool failed unexpectedly',
                                  );
                        abort.abort();
                        throw fatal;
                    }
                },
                {
                    name: agentTool.name,
                    description: agentTool.description,
                    schema: agentTool.inputSchema as unknown as Record<string, unknown>,
                },
            ),
        );

        const agent = createDeepAgent({
            model: options.modelFactory(options.model),
            tools,
            systemPrompt: PROGRAMS_AGENT_SYSTEM_PROMPT,
            responseFormat: toolStrategy(mutationPlanSchema, { handleError: true }),
        });

        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                abort.abort();
                reject(new ProgramsSyncError('AGENT_TIMEOUT', 'Agent run timed out'));
            }, options.timeoutMs);
        });

        try {
            const result = await Promise.race([
                agent.invoke(
                    {
                        messages: [
                            {
                                role: 'user',
                                content: describeRun(input.group, input.changedSources),
                            },
                        ],
                    },
                    { recursionLimit: options.maxSteps, signal: abort.signal },
                ),
                timeout,
            ]);
            const parsed = mutationPlanSchema.safeParse(result.structuredResponse);
            if (!parsed.success) {
                throw new ProgramsSyncError(
                    'INVALID_WORKFLOW_DATA',
                    'Agent returned an invalid mutation plan',
                );
            }
            const operations: CatalogMutation[] = parsed.data.operations.map((op) => ({
                kind: op.kind,
                recordType: op.record_type,
                ...(op.record_id === undefined ? {} : { recordId: op.record_id }),
                ...(op.local_key === undefined ? {} : { localKey: op.local_key }),
                data: op.data,
                sources: op.sources.map((s) =>
                    createSourceReference({
                        sourceId: s.source_id,
                        rowNumbers: s.row_numbers,
                        ...(s.ranges === undefined ? {} : { ranges: s.ranges }),
                    }),
                ),
            }));
            return createCatalogMutationPlan(operations);
        } catch (error) {
            throw this.toRunError(error, fatal);
        } finally {
            clearTimeout(timer);
        }
    }

    private toRunError(error: unknown, fatal: ProgramsSyncError | undefined): ProgramsSyncError {
        if (error instanceof ProgramsSyncError && error.code === 'AGENT_TIMEOUT') return error;
        if (fatal !== undefined) return fatal;
        if (error instanceof ProgramsSyncError) return error;
        if (isRecursionLimit(error)) {
            return new ProgramsSyncError('AGENT_TIMEOUT', 'Agent step limit exceeded');
        }
        return new ProgramsSyncError('AGENT_PROVIDER_ERROR', 'Agent provider call failed');
    }
}
