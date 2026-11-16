import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { HttpStatus } from '@nestjs/common';
import { findErrorStatus } from '../../../shared/http/error-status.registry';
import { registerPortalErrorStatuses } from '../interface/portal-error-status';
import {
    AgentNameTakenError,
    AgentNotInProductError,
    BugNotFoundError,
    InvalidBugTransitionError,
    CommentEditWindowExpiredError,
    CommentNotFoundError,
    CommentNotOwnedError,
    DepartmentNotFoundError,
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

    it('comment errors carry their codes', () => {
        expect(new CommentNotFoundError('c1').code).toBe('PORTAL_COMMENT_NOT_FOUND');
        expect(new CommentNotOwnedError('c1').code).toBe('PORTAL_COMMENT_NOT_OWNED');
        expect(new CommentEditWindowExpiredError('c1').code).toBe('PORTAL_COMMENT_EDIT_EXPIRED');
    });

    it('comment error codes are mapped to HTTP statuses', () => {
        registerPortalErrorStatuses();
        expect(findErrorStatus(PortalErrorCode.CommentNotFound)).toBe(HttpStatus.NOT_FOUND);
        expect(findErrorStatus(PortalErrorCode.CommentNotOwned)).toBe(HttpStatus.FORBIDDEN);
        expect(findErrorStatus(PortalErrorCode.CommentEditExpired)).toBe(HttpStatus.CONFLICT);
    });

    it('bug errors carry their codes', () => {
        expect(new BugNotFoundError('b1').code).toBe('PORTAL_BUG_NOT_FOUND');
        expect(new InvalidBugTransitionError('open', 'resolved').code).toBe(
            'PORTAL_BUG_INVALID_TRANSITION',
        );
        expect(new AgentNotInProductError('a1', 'p1').code).toBe('PORTAL_AGENT_NOT_IN_PRODUCT');
    });

    it('bug error codes are mapped to HTTP statuses', () => {
        registerPortalErrorStatuses();
        expect(findErrorStatus(PortalErrorCode.BugNotFound)).toBe(HttpStatus.NOT_FOUND);
        expect(findErrorStatus(PortalErrorCode.InvalidBugTransition)).toBe(HttpStatus.CONFLICT);
        expect(findErrorStatus(PortalErrorCode.AgentNotInProduct)).toBe(HttpStatus.BAD_REQUEST);
    });

    it('DepartmentNotFoundError carries its code and maps to 404', () => {
        registerPortalErrorStatuses();
        expect(new DepartmentNotFoundError('d1').code).toBe('PORTAL_DEPARTMENT_NOT_FOUND');
        expect(findErrorStatus(PortalErrorCode.DepartmentNotFound)).toBe(HttpStatus.NOT_FOUND);
    });
});
