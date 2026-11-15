import { AggregateRoot } from '../../../shared/ddd';
import { ArgumentInvalidError } from '../../../shared/errors';
import type { BugDescription } from './bug-description';
import { BugStatusPolicy, type BugStatus } from './bug-status';
import type { BugTitle } from './bug-title';
import { InvalidBugTransitionError } from './errors';
import { WontFixReason } from './wont-fix-reason';

export interface BugReportProps {
    authorId: string;
    productId: string;
    agentId: string;
    title: BugTitle;
    description: BugDescription;
    status: BugStatus;
    wontFixReason: WontFixReason | null;
    statusChangedBy: string | null;
    statusChangedAt: Date;
}

export interface ReportBugInput {
    id: string;
    authorId: string;
    productId: string;
    agentId: string;
    title: BugTitle;
    description: BugDescription;
    now: Date;
}

export interface RestoreBugReportInput extends BugReportProps {
    id: string;
    createdAt: Date;
}

/** Баг по агенту: статус хранится, переходы — по BugStatusPolicy. */
export class BugReport extends AggregateRoot<BugReportProps> {
    static report(input: ReportBugInput): BugReport {
        return new BugReport({
            id: input.id,
            createdAt: input.now,
            updatedAt: input.now,
            props: {
                authorId: input.authorId,
                productId: input.productId,
                agentId: input.agentId,
                title: input.title,
                description: input.description,
                status: 'open',
                wontFixReason: null,
                statusChangedBy: null,
                statusChangedAt: input.now,
            },
        });
    }

    static restore({ id, createdAt, ...props }: RestoreBugReportInput): BugReport {
        return new BugReport({
            id,
            createdAt,
            updatedAt: props.statusChangedAt,
            props: { ...props },
        });
    }

    get authorId(): string {
        return this.props.authorId;
    }

    get productId(): string {
        return this.props.productId;
    }

    get agentId(): string {
        return this.props.agentId;
    }

    get title(): BugTitle {
        return this.props.title;
    }

    get description(): BugDescription {
        return this.props.description;
    }

    get status(): BugStatus {
        return this.props.status;
    }

    get wontFixReason(): WontFixReason | null {
        return this.props.wontFixReason;
    }

    get statusChangedBy(): string | null {
        return this.props.statusChangedBy;
    }

    get statusChangedAt(): Date {
        return this.props.statusChangedAt;
    }

    /** Меняет статус по политике; возвращает прежний. Причина нужна и хранится только у `wont_fix`. */
    changeStatus(to: BugStatus, by: string, reason: string | null, now: Date): BugStatus {
        const from = this.props.status;
        if (!BugStatusPolicy.canTransition(from, to)) {
            throw new InvalidBugTransitionError(from, to);
        }
        const wontFixReason = to === 'wont_fix' ? WontFixReason.of(reason ?? '') : null;
        this.props.status = to;
        this.props.wontFixReason = wontFixReason;
        this.props.statusChangedBy = by;
        this.props.statusChangedAt = now;
        return from;
    }

    validate(): void {
        if ((this.props.status === 'wont_fix') !== (this.props.wontFixReason !== null)) {
            throw new ArgumentInvalidError(
                "Bug won't-fix reason must be set exactly for wont_fix status",
            );
        }
    }
}
