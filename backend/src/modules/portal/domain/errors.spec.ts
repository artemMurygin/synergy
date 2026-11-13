import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { InvalidRejectReasonError, InvalidSkillTransitionError, PortalErrorCode } from './errors';

describe('portal domain errors', () => {
    it('InvalidSkillTransitionError carries its own code and the transition', () => {
        const error = new InvalidSkillTransitionError('planned', 'testing');
        expect(error.code).toBe(PortalErrorCode.InvalidSkillTransition);
        expect(error.from).toBe('planned');
        expect(error.to).toBe('testing');
    });

    it('InvalidRejectReasonError is a 400-class argument error', () => {
        expect(new InvalidRejectReasonError('empty')).toBeInstanceOf(ArgumentInvalidError);
    });
});
