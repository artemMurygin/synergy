import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import {
    InvalidRejectReasonError,
    RequestAlreadyDecidedError,
    RequestAlreadyTakenError,
    RequestNotTakenError,
} from './errors';
import { EffortHours } from './effort-hours';
import { Frequency } from './frequency';
import { IdeaRequest, type CreateIdeaRequestInput } from './idea-request';
import { RequestTitle } from './request-title';

const T0 = new Date('2026-01-01T10:00:00Z');
const T1 = new Date('2026-01-02T10:00:00Z');
const T2 = new Date('2026-01-03T10:00:00Z');

function input(overrides: Partial<CreateIdeaRequestInput> = {}): CreateIdeaRequestInput {
    return {
        id: 'r1',
        authorId: 'u1',
        title: RequestTitle.of('Сверка актов'),
        description: 'Сверяем акты вручную',
        frequency: Frequency.of(5, 'week'),
        minutesPerRun: 20,
        peopleCount: 3,
        now: T0,
        ...overrides,
    };
}

describe('IdeaRequest', () => {
    it('is created new with the questionnaire fields', () => {
        const request = IdeaRequest.create(input());
        expect(request.decision).toEqual({ kind: 'new' });
        expect(request.statusKind).toBe('new');
        expect(request.authorId).toBe('u1');
        expect(request.title.value).toBe('Сверка актов');
        expect(request.description).toBe('Сверяем акты вручную');
        expect(request.frequency.count).toBe(5);
        expect(request.minutesPerRun).toBe(20);
        expect(request.peopleCount).toBe(3);
        expect(request.createdAt).toEqual(T0);
    });

    it('rejects a blank description', () => {
        expect(() => IdeaRequest.create(input({ description: '   ' }))).toThrow(
            ArgumentInvalidError,
        );
    });

    it.each([0, -1, 1.5, Number.NaN])('rejects minutesPerRun %s', (bad) => {
        expect(() => IdeaRequest.create(input({ minutesPerRun: bad }))).toThrow(
            ArgumentInvalidError,
        );
    });

    it.each([0, -1, 2.5, Number.NaN])('rejects peopleCount %s', (bad) => {
        expect(() => IdeaRequest.create(input({ peopleCount: bad }))).toThrow(ArgumentInvalidError);
    });

    it('accept binds the skill, effort, reviewer and who decided', () => {
        const request = IdeaRequest.create(input());
        request.take('dev1', T1);
        request.accept('s1', EffortHours.of(16), 'dev1', T2);
        expect(request.decision).toEqual({
            kind: 'accepted',
            reviewerId: 'dev1',
            takenAt: T1,
            skillId: 's1',
            effortHours: 16,
            decidedBy: 'dev1',
            decidedAt: T2,
        });
        expect(request.statusKind).toBe('accepted');
    });

    it('reject stores the trimmed reason, reviewer, who and when', () => {
        const request = IdeaRequest.create(input());
        request.take('dev1', T1);
        request.reject('  Уже есть в поставке ', 'dev1', T2);
        expect(request.decision).toEqual({
            kind: 'rejected',
            reviewerId: 'dev1',
            takenAt: T1,
            reason: 'Уже есть в поставке',
            decidedBy: 'dev1',
            decidedAt: T2,
        });
    });

    it('decidedBy may differ from the reviewer who took the request', () => {
        const request = IdeaRequest.create(input());
        request.take('dev1', T1);
        request.reject('нет', 'dev2', T2);
        expect(request.decision).toMatchObject({ reviewerId: 'dev1', decidedBy: 'dev2' });
    });

    it('reject with an empty reason fails and the request stays under_review', () => {
        const request = IdeaRequest.create(input());
        request.take('dev1', T1);
        expect(() => {
            request.reject('   ', 'dev1', T2);
        }).toThrow(InvalidRejectReasonError);
        expect(request.statusKind).toBe('under_review');
    });

    it('take moves new to under_review', () => {
        const request = IdeaRequest.create(input());
        request.take('dev1', T1);
        expect(request.decision).toEqual({ kind: 'under_review', reviewerId: 'dev1', takenAt: T1 });
        expect(request.statusKind).toBe('under_review');
    });

    it('take from under_review is RequestAlreadyTakenError', () => {
        const request = IdeaRequest.create(input());
        request.take('dev1', T1);
        expect(() => {
            request.take('dev2', T2);
        }).toThrow(RequestAlreadyTakenError);
        expect(request.decision).toMatchObject({ reviewerId: 'dev1' });
    });

    it('take from a decided request is RequestAlreadyDecidedError', () => {
        const request = IdeaRequest.create(input());
        request.take('dev1', T1);
        request.reject('нет', 'dev1', T2);
        expect(() => {
            request.take('dev2', T2);
        }).toThrow(RequestAlreadyDecidedError);
    });

    it('accept and reject from new are RequestNotTakenError', () => {
        const request = IdeaRequest.create(input());
        expect(() => {
            request.accept('s1', EffortHours.of(8), 'dev1', T2);
        }).toThrow(RequestNotTakenError);
        expect(() => {
            request.reject('нет', 'dev1', T2);
        }).toThrow(RequestNotTakenError);
        expect(request.statusKind).toBe('new');
    });

    it('a second decision is refused and changes nothing', () => {
        const accepted = IdeaRequest.create(input());
        accepted.take('dev1', T1);
        accepted.accept('s1', EffortHours.of(8), 'dev1', T2);
        expect(() => {
            accepted.accept('s2', EffortHours.of(8), 'dev2', T2);
        }).toThrow(RequestAlreadyDecidedError);
        expect(() => {
            accepted.reject('нет', 'dev2', T2);
        }).toThrow(RequestAlreadyDecidedError);
        expect(accepted.decision).toMatchObject({ kind: 'accepted', skillId: 's1' });

        const rejected = IdeaRequest.create(input());
        rejected.take('dev1', T1);
        rejected.reject('нет', 'dev1', T2);
        expect(() => {
            rejected.accept('s1', EffortHours.of(8), 'dev2', T2);
        }).toThrow(RequestAlreadyDecidedError);
        expect(rejected.decision).toMatchObject({ kind: 'rejected', reason: 'нет' });
    });

    it('accept requires a skill id: accepted without a skill is impossible', () => {
        const request = IdeaRequest.create(input());
        request.take('dev1', T1);
        expect(() => {
            request.accept('', EffortHours.of(8), 'dev1', T2);
        }).toThrow(ArgumentInvalidError);
        expect(request.statusKind).toBe('under_review');
    });

    it('restore keeps the stored decision', () => {
        const request = IdeaRequest.restore({
            ...input(),
            decision: {
                kind: 'accepted',
                reviewerId: 'dev1',
                takenAt: T0,
                skillId: 's1',
                effortHours: null,
                decidedBy: 'dev1',
                decidedAt: T1,
            },
            createdAt: T0,
            updatedAt: T1,
        });
        expect(request.decision.kind).toBe('accepted');
    });
});
