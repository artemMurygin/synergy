import { Injectable } from '@nestjs/common';
import { BugAccessPolicy } from '../domain/bug-access-policy';
import { BugNotFoundError } from '../domain/errors';
import { BugQuery } from '../domain/ports/bug-query.port';
import { toBugView, type BugView } from './bug-view';

export interface GetBugInput {
    bugId: string;
    actorId: string;
    roles: readonly string[];
}

@Injectable()
export class GetBugUseCase {
    constructor(private readonly query: BugQuery) {}

    /** Автор или `developer`; для остальных чужой баг неотличим от несуществующего. */
    async execute(input: GetBugInput): Promise<BugView> {
        const record = await this.query.findView(input.bugId);
        if (record === null) throw new BugNotFoundError(input.bugId);
        const allowed = BugAccessPolicy.canView(
            { authorId: record.author.id },
            { id: input.actorId, roles: input.roles },
        );
        if (!allowed) throw new BugNotFoundError(input.bugId);
        return toBugView(record, input.roles);
    }
}
