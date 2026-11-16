import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../../shared/errors';
import { CallId } from '../value-objects/call-id.value-object';
import { Call } from './call.entity';
import { CallMetricScore } from './call-metric-score.entity';
import { CallSummary } from './call-summary.entity';
import { CallTag } from './call-tag.entity';

function createCall(): Call {
    return Call.create({
        callId: new CallId(1),
        projectId: 'project-1',
        manager: 'manager-1',
        client: 'client-1',
        callType: 'incoming',
        callCreatedAt: new Date('2026-01-01T00:00:00Z'),
        callCompletedAt: new Date('2026-01-01T00:05:00Z'),
        scoredAt: null,
        rescoredAt: null,
        durationSeconds: 300,
        totalScore: null,
        maxScore: null,
    });
}

function metricScore(metricId: string, scoreValue: number): CallMetricScore {
    return new CallMetricScore({
        callId: 1,
        metricId,
        metricTitle: `metric-${metricId}`,
        scoreValue,
        maxScore: 10,
        reason: null,
        recommendations: null,
        isException: false,
    });
}

function tag(tagId: string, value: string): CallTag {
    return new CallTag({
        callId: 1,
        tagId,
        tagTitle: `tag-${tagId}`,
        value,
        valueDescription: null,
    });
}

function summary(title: string): CallSummary {
    return new CallSummary({ callId: 1, summaryTitle: title, summaryText: `text-${title}` });
}

describe('Call', () => {
    it('replaces children with the full given set when there are no duplicates', () => {
        const call = createCall();

        call.replaceChildren(
            [metricScore('m1', 1), metricScore('m2', 2)],
            [tag('t1', 'v1')],
            [summary('s1')],
        );

        expect(call.metricScores.map((score) => score.metricId)).toEqual(['m1', 'm2']);
        expect(call.tags.map((callTag) => callTag.tagId)).toEqual(['t1']);
        expect(call.summaries.map((callSummary) => callSummary.summaryTitle)).toEqual(['s1']);
    });

    it('drops duplicate metricScores by metricId, keeping the last occurrence', () => {
        const call = createCall();

        call.replaceChildren([metricScore('m1', 1), metricScore('m1', 9)], [], []);

        expect(call.metricScores).toHaveLength(1);
        expect(call.metricScores[0]?.scoreValue).toBe(9);
    });

    it('drops duplicate tags by tagId, keeping the last occurrence', () => {
        const call = createCall();

        call.replaceChildren([], [tag('t1', 'first'), tag('t1', 'second')], []);

        expect(call.tags).toHaveLength(1);
        expect(call.tags[0]?.value).toBe('second');
    });

    it('fully replaces the previous set instead of merging with it', () => {
        const call = createCall();
        call.replaceChildren([metricScore('m1', 1)], [tag('t1', 'v1')], [summary('s1')]);

        call.replaceChildren([metricScore('m2', 2)], [tag('t2', 'v2')], [summary('s2')]);

        expect(call.metricScores.map((score) => score.metricId)).toEqual(['m2']);
        expect(call.tags.map((callTag) => callTag.tagId)).toEqual(['t2']);
        expect(call.summaries.map((callSummary) => callSummary.summaryTitle)).toEqual(['s2']);
    });

    it('rejects a child that belongs to a different callId', () => {
        const call = createCall();
        const foreignMetricScore = new CallMetricScore({
            callId: 2,
            metricId: 'm1',
            metricTitle: 'metric-m1',
            scoreValue: 1,
            maxScore: 10,
            reason: null,
            recommendations: null,
            isException: false,
        });

        expect(() => {
            call.replaceChildren([foreignMetricScore], [], []);
        }).toThrow(ArgumentInvalidError);
    });
});
