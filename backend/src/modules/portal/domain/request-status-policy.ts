import { SKILL_STATUS_LABELS } from '../contracts/skill-status-labels';
import { RequestIntegrityError } from './errors';
import type { RequestDecision } from './request-decision';
import type { SkillStatus } from './skill-status';

export type RequestStatusCode = 'pending' | 'rejected' | SkillStatus;

export interface RequestStatus {
    readonly code: RequestStatusCode;
    readonly label: string;
}

export const REQUEST_PENDING_LABEL = 'На рассмотрении';
export const REQUEST_REJECTED_LABEL = 'Отклонена';

/** Единственное место правила вывода статуса заявки для автора. */
export const RequestStatusPolicy = {
    statusOf(decision: RequestDecision, skillStatus: SkillStatus | null): RequestStatus {
        switch (decision.kind) {
            case 'pending':
                return { code: 'pending', label: REQUEST_PENDING_LABEL };
            case 'rejected':
                return { code: 'rejected', label: REQUEST_REJECTED_LABEL };
            case 'accepted':
                if (skillStatus === null) throw new RequestIntegrityError('accepted');
                return { code: skillStatus, label: SKILL_STATUS_LABELS[skillStatus] };
        }
    },
};
