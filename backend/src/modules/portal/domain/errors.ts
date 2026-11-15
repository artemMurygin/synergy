import { ArgumentInvalidError, BaseError } from '../../../shared/errors';

export const PortalErrorCode = {
    InvalidSkillTransition: 'PORTAL_INVALID_SKILL_TRANSITION',
    RequestAlreadyDecided: 'PORTAL_REQUEST_ALREADY_DECIDED',
    RequestNotFound: 'PORTAL_REQUEST_NOT_FOUND',
    SkillNotFound: 'PORTAL_SKILL_NOT_FOUND',
    AgentNotFound: 'PORTAL_AGENT_NOT_FOUND',
    SkillArchived: 'PORTAL_SKILL_ARCHIVED',
    AgentArchived: 'PORTAL_AGENT_ARCHIVED',
    RequestIntegrity: 'PORTAL_REQUEST_INTEGRITY',
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
