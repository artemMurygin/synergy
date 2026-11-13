import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { InvalidRejectReasonError, RequestAlreadyDecidedError } from './errors';
import { Frequency } from './frequency';
import { IdeaRequest, type CreateIdeaRequestInput } from './idea-request';
import { RequestTitle } from './request-title';

const T0 = new Date('2026-01-01T10:00:00Z');
const T1 = new Date('2026-01-02T10:00:00Z');

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
    it('is created pending with the questionnaire fields', () => {
        const request = IdeaRequest.create(input());
        expect(request.decision).toEqual({ kind: 'pending' });
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

    it('accept binds the skill and records who and when', () => {
        const request = IdeaRequest.create(input());
        request.accept('s1', 'dev1', T1);
        expect(request.decision).toEqual({
            kind: 'accepted',
            skillId: 's1',
            decidedBy: 'dev1',
            decidedAt: T1,
        });
    });

    it('reject stores the trimmed reason, who and when', () => {
        const request = IdeaRequest.create(input());
        request.reject('  Уже есть в поставке ', 'dev1', T1);
        expect(request.decision).toEqual({
            kind: 'rejected',
            reason: 'Уже есть в поставке',
            decidedBy: 'dev1',
            decidedAt: T1,
        });
    });

    it('reject with an empty reason fails and the request stays pending', () => {
        const request = IdeaRequest.create(input());
        expect(() => {
            request.reject('   ', 'dev1', T1);
        }).toThrow(InvalidRejectReasonError);
        expect(request.decision).toEqual({ kind: 'pending' });
    });

    it('a second decision is refused and changes nothing', () => {
        const accepted = IdeaRequest.create(input());
        accepted.accept('s1', 'dev1', T1);
        expect(() => {
            accepted.accept('s2', 'dev2', T1);
        }).toThrow(RequestAlreadyDecidedError);
        expect(() => {
            accepted.reject('нет', 'dev2', T1);
        }).toThrow(RequestAlreadyDecidedError);
        expect(accepted.decision).toMatchObject({ kind: 'accepted', skillId: 's1' });

        const rejected = IdeaRequest.create(input());
        rejected.reject('нет', 'dev1', T1);
        expect(() => {
            rejected.accept('s1', 'dev2', T1);
        }).toThrow(RequestAlreadyDecidedError);
        expect(rejected.decision).toMatchObject({ kind: 'rejected', reason: 'нет' });
    });

    it('accept requires a skill id: accepted without a skill is impossible', () => {
        const request = IdeaRequest.create(input());
        expect(() => {
            request.accept('', 'dev1', T1);
        }).toThrow(ArgumentInvalidError);
        expect(request.decision).toEqual({ kind: 'pending' });
    });

    it('restore keeps the stored decision', () => {
        const request = IdeaRequest.restore({
            ...input(),
            decision: { kind: 'accepted', skillId: 's1', decidedBy: 'dev1', decidedAt: T1 },
            createdAt: T0,
            updatedAt: T1,
        });
        expect(request.decision.kind).toBe('accepted');
    });
});
