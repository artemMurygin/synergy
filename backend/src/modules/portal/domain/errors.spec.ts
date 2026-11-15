import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import {
    AgentNameTakenError,
    InvalidRejectReasonError,
    InvalidSkillTransitionError,
    PortalErrorCode,
    ProductNameTakenError,
    ProductNotFoundError,
    RequestAlreadyTakenError,
    RequestNotTakenError,
} from './errors';

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

    it('AgentNameTakenError has its code and message', () => {
        const error = new AgentNameTakenError();
        expect(error.code).toBe('PORTAL_AGENT_NAME_TAKEN');
        expect(error.message).toBe('агент с таким названием уже есть');
    });

    it('ProductNameTakenError has its code and message', () => {
        const error = new ProductNameTakenError();
        expect(error.code).toBe('PORTAL_PRODUCT_NAME_TAKEN');
        expect(error.message).toBe('продукт с таким названием уже есть');
    });

    it('ProductNotFoundError has its code', () => {
        const error = new ProductNotFoundError('p-1');
        expect(error.code).toBe('PORTAL_PRODUCT_NOT_FOUND');
        expect(error.productId).toBe('p-1');
    });

    it('new request errors carry their codes', () => {
        expect(new RequestAlreadyTakenError('r1').code).toBe('PORTAL_REQUEST_ALREADY_TAKEN');
        expect(new RequestNotTakenError('r1').code).toBe('PORTAL_REQUEST_NOT_TAKEN');
        expect(new ProductNotFoundError('p1').code).toBe('PORTAL_PRODUCT_NOT_FOUND');
    });
});
