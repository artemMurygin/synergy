import { AggregateRoot } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';
import { CallId } from '../value-objects/call-id.value-object';
import type { CallMetricScore } from './call-metric-score.entity';
import type { CallSummary } from './call-summary.entity';
import type { CallTag } from './call-tag.entity';

export interface CallProps {
    projectId: string;
    manager: string | null;
    client: string | null;
    callType: string | null;
    callCreatedAt: Date | null;
    callCompletedAt: Date | null;
    scoredAt: Date | null;
    rescoredAt: Date | null;
    durationSeconds: number | null;
    totalScore: number | null;
    maxScore: number | null;
    metricScores: CallMetricScore[];
    tags: CallTag[];
    summaries: CallSummary[];
}

export interface CreateCallProps {
    callId: CallId;
    projectId: string;
    manager: string | null;
    client: string | null;
    callType: string | null;
    callCreatedAt: Date | null;
    callCompletedAt: Date | null;
    scoredAt: Date | null;
    rescoredAt: Date | null;
    durationSeconds: number | null;
    totalScore: number | null;
    maxScore: number | null;
}

export class Call extends AggregateRoot<CallProps> {
    static create({ callId, ...props }: CreateCallProps): Call {
        return new Call({
            id: String(callId.value),
            props: { ...props, metricScores: [], tags: [], summaries: [] },
        });
    }

    get callId(): CallId {
        return new CallId(Number(this.id));
    }

    get projectId(): string {
        return this.props.projectId;
    }

    get manager(): string | null {
        return this.props.manager;
    }

    get client(): string | null {
        return this.props.client;
    }

    get callType(): string | null {
        return this.props.callType;
    }

    get callCreatedAt(): Date | null {
        return this.props.callCreatedAt;
    }

    get callCompletedAt(): Date | null {
        return this.props.callCompletedAt;
    }

    get scoredAt(): Date | null {
        return this.props.scoredAt;
    }

    get rescoredAt(): Date | null {
        return this.props.rescoredAt;
    }

    get durationSeconds(): number | null {
        return this.props.durationSeconds;
    }

    get totalScore(): number | null {
        return this.props.totalScore;
    }

    get maxScore(): number | null {
        return this.props.maxScore;
    }

    get metricScores(): readonly CallMetricScore[] {
        return this.props.metricScores;
    }

    get tags(): readonly CallTag[] {
        return this.props.tags;
    }

    get summaries(): readonly CallSummary[] {
        return this.props.summaries;
    }

    /**
     * Полностью заменяет дочерние записи звонка: отбрасывает дубликаты
     * по metricId/tagId внутри набора, оставляя последнее вхождение.
     */
    replaceChildren(
        metricScores: readonly CallMetricScore[],
        tags: readonly CallTag[],
        summaries: readonly CallSummary[],
    ): void {
        this.assertOwnership(metricScores, tags, summaries);
        this.props.metricScores = deduplicateByKey(metricScores, (score) => score.metricId);
        this.props.tags = deduplicateByKey(tags, (tag) => tag.tagId);
        this.props.summaries = [...summaries];
        this.touch();
    }

    validate(): void {
        if (this.props.projectId.trim() === '') {
            throw new ArgumentInvalidError('Call projectId must not be blank');
        }
    }

    private assertOwnership(
        metricScores: readonly CallMetricScore[],
        tags: readonly CallTag[],
        summaries: readonly CallSummary[],
    ): void {
        const ownCallId = this.callId.value;
        const belongsToThisCall = (childCallId: number): boolean => childCallId === ownCallId;

        if (
            !metricScores.every((score) => belongsToThisCall(score.callId)) ||
            !tags.every((tag) => belongsToThisCall(tag.callId)) ||
            !summaries.every((summary) => belongsToThisCall(summary.callId))
        ) {
            throw new ArgumentInvalidError('Call children must belong to this callId');
        }
    }
}

function deduplicateByKey<TChild>(
    items: readonly TChild[],
    getKey: (item: TChild) => string,
): TChild[] {
    const lastByKey = new Map<string, TChild>();
    for (const item of items) {
        lastByKey.set(getKey(item), item);
    }
    return [...lastByKey.values()];
}
