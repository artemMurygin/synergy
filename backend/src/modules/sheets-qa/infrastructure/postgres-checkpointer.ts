import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

export const AGENT_CHECKPOINTER = Symbol('AGENT_CHECKPOINTER');

/** Creates the saver and its tables (owned by the library, not by our migrations). */
export async function createPostgresCheckpointer(connectionString: string): Promise<PostgresSaver> {
    const saver = PostgresSaver.fromConnString(connectionString);
    await saver.setup();
    return saver;
}

@Injectable()
export class CheckpointerLifecycle implements OnApplicationShutdown {
    constructor(@Inject(AGENT_CHECKPOINTER) private readonly saver: PostgresSaver) {}

    async onApplicationShutdown(): Promise<void> {
        await this.saver.end();
    }
}
