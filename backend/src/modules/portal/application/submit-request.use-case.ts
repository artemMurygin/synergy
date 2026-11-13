import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Frequency } from '../domain/frequency';
import { IdeaRequest } from '../domain/idea-request';
import { Clock } from '../domain/ports/clock.port';
import { RequestQuery } from '../domain/ports/request-query.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import { RequestTitle } from '../domain/request-title';
import type { RequestView } from './request-view';

export interface SubmitRequestInput {
    /** Автор берётся из токена контроллером, а не из тела запроса. */
    authorId: string;
    title: string;
    description: string;
    frequency: { count: number; period: string };
    minutesPerRun: number;
    peopleCount: number;
}

@Injectable()
export class SubmitRequestUseCase {
    constructor(
        private readonly requests: RequestRepository,
        private readonly query: RequestQuery,
        private readonly clock: Clock,
    ) {}

    async execute(input: SubmitRequestInput): Promise<RequestView> {
        const request = IdeaRequest.create({
            id: randomUUID(),
            authorId: input.authorId,
            title: RequestTitle.of(input.title),
            description: input.description,
            frequency: Frequency.of(input.frequency.count, input.frequency.period),
            minutesPerRun: input.minutesPerRun,
            peopleCount: input.peopleCount,
            now: this.clock.now(),
        });
        request.validate();
        await this.requests.save(request);
        return requireView(await this.query.findView(request.id), request.id);
    }
}

function requireView(view: RequestView | null, id: string): RequestView {
    if (view === null) throw new Error(`Request ${id} disappeared after save`);
    return view;
}
