import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

const AgentState = Annotation.Root({
    query: Annotation<string>(),
    answer: Annotation<string>(),
});

export type AgentStateType = typeof AgentState.State;

export interface AgentGraph {
    invoke: (input: { query: string }) => Promise<AgentStateType>;
}

export function buildAgentGraph(deps: { ask: (query: string) => Promise<string> }): AgentGraph {
    return new StateGraph(AgentState)
        .addNode('respond', async (state) => ({ answer: await deps.ask(state.query) }))
        .addEdge(START, 'respond')
        .addEdge('respond', END)
        .compile();
}
