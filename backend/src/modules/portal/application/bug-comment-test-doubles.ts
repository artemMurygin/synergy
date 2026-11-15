import type { BugComment } from '../domain/bug-comment';
import { BugDescription } from '../domain/bug-description';
import { BugReport } from '../domain/bug-report';
import { BugTitle } from '../domain/bug-title';
import { BugCommentQuery, type BugCommentRecord } from '../domain/ports/bug-comment-query.port';
import { BugCommentRepository } from '../domain/ports/bug-comment-repository.port';
import { BugRepository } from '../domain/ports/bug-repository.port';
import type { BugStatus } from '../domain/bug-status';
import {
    FakeClock,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
    type TransactionParticipant,
} from './test-doubles';

export class InMemoryBugRepository extends BugRepository implements TransactionParticipant {
    readonly byId = new Map<string, BugReport>();

    snapshot(): () => void {
        const saved = new Map(this.byId);
        return () => {
            this.byId.clear();
            for (const [id, bug] of saved) this.byId.set(id, bug);
        };
    }

    insert(bug: BugReport): Promise<void> {
        this.byId.set(bug.id, bug);
        return Promise.resolve();
    }

    findById(id: string): Promise<BugReport | null> {
        return Promise.resolve(this.byId.get(id) ?? null);
    }

    updateStatus(bug: BugReport, expected: BugStatus): Promise<boolean> {
        const stored = this.byId.get(bug.id);
        if (stored?.status !== expected) return Promise.resolve(false);
        this.byId.set(bug.id, bug);
        return Promise.resolve(true);
    }
}

export class InMemoryBugCommentRepository
    extends BugCommentRepository
    implements TransactionParticipant
{
    readonly byId = new Map<string, BugComment>();

    snapshot(): () => void {
        const saved = new Map(this.byId);
        return () => {
            this.byId.clear();
            for (const [id, comment] of saved) this.byId.set(id, comment);
        };
    }

    insert(comment: BugComment): Promise<void> {
        this.byId.set(comment.id, comment);
        return Promise.resolve();
    }

    findById(id: string): Promise<BugComment | null> {
        return Promise.resolve(this.byId.get(id) ?? null);
    }

    update(comment: BugComment): Promise<void> {
        this.byId.set(comment.id, comment);
        return Promise.resolve();
    }
}

/** Лента комментариев бага в памяти: порядок `createdAt`, затем `id`; метка роли по автору бага. */
export class InMemoryBugCommentQuery extends BugCommentQuery {
    constructor(
        private readonly comments: InMemoryBugCommentRepository,
        private readonly bugs: InMemoryBugRepository,
    ) {
        super();
    }

    private toRecord(comment: BugComment): BugCommentRecord {
        const bug = this.bugs.byId.get(comment.bugId);
        return {
            id: comment.id,
            authorId: comment.authorId,
            body: comment.body.value,
            author: { id: comment.authorId, login: comment.authorId, fullName: comment.authorId },
            authorRole: bug?.authorId === comment.authorId ? 'bug_author' : 'developer',
            createdAt: comment.createdAt,
            editedAt: comment.editedAt,
        };
    }

    listByBug(bugId: string): Promise<BugCommentRecord[]> {
        const items = [...this.comments.byId.values()]
            .filter((comment) => comment.bugId === bugId)
            .sort(
                (a, b) =>
                    a.createdAt.getTime() - b.createdAt.getTime() ||
                    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
            );
        return Promise.resolve(items.map((comment) => this.toRecord(comment)));
    }

    findView(id: string): Promise<BugCommentRecord | null> {
        const comment = this.comments.byId.get(id);
        return Promise.resolve(comment === undefined ? null : this.toRecord(comment));
    }
}

export interface BugCommentFixture {
    clock: FakeClock;
    bugs: InMemoryBugRepository;
    comments: InMemoryBugCommentRepository;
    commentQuery: BugCommentQuery;
    events: RecordingEventPublisher;
    transactions: SnapshotTransactionRunner;
    addBug(id: string, authorId: string): BugReport;
}

export function createBugCommentFixture(): BugCommentFixture {
    const clock = new FakeClock();
    const bugs = new InMemoryBugRepository();
    const comments = new InMemoryBugCommentRepository();
    const commentQuery = new InMemoryBugCommentQuery(comments, bugs);
    const ref: { runner?: SnapshotTransactionRunner } = {};
    const events = new RecordingEventPublisher(() => {
        if (ref.runner === undefined) throw new Error('transactions not ready');
        return ref.runner;
    });
    const transactions = new SnapshotTransactionRunner([bugs, comments, events]);
    ref.runner = transactions;
    return {
        clock,
        bugs,
        comments,
        commentQuery,
        events,
        transactions,
        addBug(id, authorId) {
            const bug = BugReport.report({
                id,
                authorId,
                productId: 'product',
                agentId: 'agent',
                title: BugTitle.of('Сломалось'),
                description: BugDescription.of('Описание'),
                now: clock.now(),
            });
            bugs.byId.set(id, bug);
            return bug;
        },
    };
}
