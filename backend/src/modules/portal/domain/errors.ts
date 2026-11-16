import { ArgumentInvalidError, BaseError } from '../../../shared/errors';

export const PortalErrorCode = {
    InvalidSkillTransition: 'PORTAL_INVALID_SKILL_TRANSITION',
    RequestAlreadyDecided: 'PORTAL_REQUEST_ALREADY_DECIDED',
    RequestAlreadyTaken: 'PORTAL_REQUEST_ALREADY_TAKEN',
    RequestNotTaken: 'PORTAL_REQUEST_NOT_TAKEN',
    ProductNotFound: 'PORTAL_PRODUCT_NOT_FOUND',
    RequestNotFound: 'PORTAL_REQUEST_NOT_FOUND',
    SkillNotFound: 'PORTAL_SKILL_NOT_FOUND',
    AgentNotFound: 'PORTAL_AGENT_NOT_FOUND',
    SkillArchived: 'PORTAL_SKILL_ARCHIVED',
    AgentArchived: 'PORTAL_AGENT_ARCHIVED',
    RequestIntegrity: 'PORTAL_REQUEST_INTEGRITY',
    AgentNameTaken: 'PORTAL_AGENT_NAME_TAKEN',
    ProductNameTaken: 'PORTAL_PRODUCT_NAME_TAKEN',
    SlugTaken: 'PORTAL_SLUG_TAKEN',
    CommentNotFound: 'PORTAL_COMMENT_NOT_FOUND',
    CommentNotOwned: 'PORTAL_COMMENT_NOT_OWNED',
    CommentEditExpired: 'PORTAL_COMMENT_EDIT_EXPIRED',
    BugNotFound: 'PORTAL_BUG_NOT_FOUND',
    InvalidBugTransition: 'PORTAL_BUG_INVALID_TRANSITION',
    AgentNotInProduct: 'PORTAL_AGENT_NOT_IN_PRODUCT',
    DepartmentNotFound: 'PORTAL_DEPARTMENT_NOT_FOUND',
} as const;

/** Статус навыка можно сменить только по таблице переходов (HTTP 409). */
export class InvalidSkillTransitionError extends BaseError {
    readonly code = PortalErrorCode.InvalidSkillTransition;

    constructor(
        readonly from: string,
        readonly to: string,
    ) {
        super(`Skill status cannot change from ${from} to ${to}`);
    }
}

/** По заявке решение уже принято (HTTP 409). */
export class RequestAlreadyDecidedError extends BaseError {
    readonly code = PortalErrorCode.RequestAlreadyDecided;

    constructor(readonly requestId: string) {
        super(`Request ${requestId} already has a decision`);
    }
}

/** Заявку уже взяли в работу (HTTP 409). */
export class RequestAlreadyTakenError extends BaseError {
    readonly code = PortalErrorCode.RequestAlreadyTaken;

    constructor(readonly requestId: string) {
        super(`Request ${requestId} is already under review`);
    }
}

/** Решить можно только взятую в работу заявку (HTTP 409). */
export class RequestNotTakenError extends BaseError {
    readonly code = PortalErrorCode.RequestNotTaken;

    constructor(readonly requestId: string) {
        super(`Request ${requestId} has not been taken into work`);
    }
}

export class RequestNotFoundError extends BaseError {
    readonly code = PortalErrorCode.RequestNotFound;

    constructor(readonly requestId: string) {
        super(`Request ${requestId} not found`);
    }
}

export class SkillNotFoundError extends BaseError {
    readonly code = PortalErrorCode.SkillNotFound;

    constructor(readonly skillId: string) {
        super(`Skill ${skillId} not found`);
    }
}

export class AgentNotFoundError extends BaseError {
    readonly code = PortalErrorCode.AgentNotFound;

    constructor(readonly agentId: string) {
        super(`Agent ${agentId} not found`);
    }
}

/** Причина отклонения пуста или слишком длинна (HTTP 400). */
export class InvalidRejectReasonError extends ArgumentInvalidError {}

/** Нарушение целостности данных, например принятая заявка без статуса навыка (HTTP 500). */
export class RequestIntegrityError extends BaseError {
    readonly code = PortalErrorCode.RequestIntegrity;

    constructor(readonly requestDecision: string) {
        super(`Data integrity violation: ${requestDecision} request has no skill status`);
    }
}

/** Навык в архиве: менять статус нельзя (HTTP 409). */
export class SkillArchivedError extends BaseError {
    readonly code = PortalErrorCode.SkillArchived;

    constructor(readonly skillId: string) {
        super(`Skill ${skillId} is archived`);
    }
}

/** Агент в архиве: операция недоступна (HTTP 409). */
export class AgentArchivedError extends BaseError {
    readonly code = PortalErrorCode.AgentArchived;

    constructor(readonly agentId: string) {
        super(`Agent ${agentId} is archived`);
    }
}

/** Агент с таким названием уже есть (HTTP 409). */
export class AgentNameTakenError extends BaseError {
    readonly code = PortalErrorCode.AgentNameTaken;

    constructor() {
        super('агент с таким названием уже есть');
    }
}

/** Продукт с таким названием уже есть (HTTP 409). */
export class ProductNameTakenError extends BaseError {
    readonly code = PortalErrorCode.ProductNameTaken;

    constructor() {
        super('продукт с таким названием уже есть');
    }
}

/** Продукт каталога не найден (HTTP 404). */
export class ProductNotFoundError extends BaseError {
    readonly code = PortalErrorCode.ProductNotFound;

    constructor(readonly productId: string) {
        super(`Product ${productId} not found`);
    }
}

/** Slug агента или продукта занят (внутренняя ошибка: use-case повторяет подбор slug). */
export class SlugTakenError extends BaseError {
    readonly code = PortalErrorCode.SlugTaken;

    constructor() {
        super('slug is already taken');
    }
}

/** Комментарий не найден в этой заявке (HTTP 404). */
export class CommentNotFoundError extends BaseError {
    readonly code = PortalErrorCode.CommentNotFound;

    constructor(readonly commentId: string) {
        super(`Comment ${commentId} not found`);
    }
}

/** Править можно только свой комментарий (HTTP 403). */
export class CommentNotOwnedError extends BaseError {
    readonly code = PortalErrorCode.CommentNotOwned;

    constructor(readonly commentId: string) {
        super(`Comment ${commentId} belongs to another user`);
    }
}

/** Окно правки комментария истекло (HTTP 409). */
export class CommentEditWindowExpiredError extends BaseError {
    readonly code = PortalErrorCode.CommentEditExpired;

    constructor(readonly commentId: string) {
        super(`Edit window for comment ${commentId} has expired`);
    }
}

/** Баг не найден или недоступен пользователю (HTTP 404). */
export class BugNotFoundError extends BaseError {
    readonly code = PortalErrorCode.BugNotFound;

    constructor(readonly bugId: string) {
        super(`Bug ${bugId} not found`);
    }
}

/** Статус бага нельзя сменить по таблице переходов (HTTP 409). */
export class InvalidBugTransitionError extends BaseError {
    readonly code = PortalErrorCode.InvalidBugTransition;

    constructor(
        readonly from: string,
        readonly to: string,
    ) {
        super(`Bug status cannot change from ${from} to ${to}`);
    }
}

/** Агент не относится к выбранному продукту (HTTP 400). */
export class AgentNotInProductError extends BaseError {
    readonly code = PortalErrorCode.AgentNotInProduct;

    constructor(
        readonly agentId: string,
        readonly productId: string,
    ) {
        super(`Agent ${agentId} does not belong to product ${productId}`);
    }
}

/** Отдел не найден в справочнике (HTTP 404). */
export class DepartmentNotFoundError extends BaseError {
    readonly code = PortalErrorCode.DepartmentNotFound;

    constructor(readonly departmentId: string) {
        super(`Department ${departmentId} not found`);
    }
}
