import { EventEncoder } from '@ag-ui/encoder';
import type { Response } from 'express';
import type { RunObserver } from '../../application/start-agent-run.use-case';
import type { AgentEvent } from '../../domain/agent-event';
import type { AgUiEventMapper } from './ag-ui-event-mapper';

export class SseRunObserver implements RunObserver {
    private readonly encoder = new EventEncoder();
    private hasSentHeaders = false;
    private isDetached = false;

    constructor(
        private readonly res: Response,
        private readonly mapper: AgUiEventMapper,
    ) {
        res.on('close', () => {
            this.isDetached = true;
        });
    }

    open(): void {
        if (this.hasSentHeaders || this.isDetached) return;
        this.hasSentHeaders = true;
        this.res.status(200).set({
            'Content-Type': this.encoder.getContentType(),
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        this.res.flushHeaders();
    }

    next(event: AgentEvent): void {
        this.open();
        if (this.isDetached) return;
        for (const agUiEvent of this.mapper.map(event)) {
            this.res.write(this.encoder.encodeSSE(agUiEvent));
        }
    }

    close(): void {
        if (this.isDetached || this.res.writableEnded) return;
        this.res.end();
    }
}
