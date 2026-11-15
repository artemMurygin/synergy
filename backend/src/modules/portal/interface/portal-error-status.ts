import { HttpStatus } from '@nestjs/common';
import { registerErrorStatuses } from '../../../shared/http/error-status.registry';
import { PortalErrorCode } from '../domain/errors';

/** Ошибки ввода (400) приходят из `ArgumentInvalidError`; здесь только коды модуля. */
export function registerPortalErrorStatuses(): void {
    registerErrorStatuses({
        [PortalErrorCode.RequestNotFound]: HttpStatus.NOT_FOUND,
        [PortalErrorCode.SkillNotFound]: HttpStatus.NOT_FOUND,
        [PortalErrorCode.AgentNotFound]: HttpStatus.NOT_FOUND,
        [PortalErrorCode.InvalidSkillTransition]: HttpStatus.CONFLICT,
        [PortalErrorCode.SkillArchived]: HttpStatus.CONFLICT,
        [PortalErrorCode.AgentArchived]: HttpStatus.CONFLICT,
        [PortalErrorCode.RequestAlreadyDecided]: HttpStatus.CONFLICT,
        [PortalErrorCode.RequestAlreadyTaken]: HttpStatus.CONFLICT,
        [PortalErrorCode.RequestNotTaken]: HttpStatus.CONFLICT,
        [PortalErrorCode.ProductNotFound]: HttpStatus.NOT_FOUND,
        [PortalErrorCode.AgentNameTaken]: HttpStatus.CONFLICT,
        [PortalErrorCode.ProductNameTaken]: HttpStatus.CONFLICT,
    });
}
