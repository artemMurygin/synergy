import { SKILL_STATUS_LABELS } from '../contracts/skill-status-labels';
import { RequestIntegrityError } from './errors';
import type { RequestDecision } from './request-decision';
import type { SkillStatus } from './skill-status';

export type RequestStatusCode = 'new' | 'under_review' | 'rejected' | SkillStatus;

export interface RequestStatus {
    readonly code: RequestStatusCode;
    readonly label: string;
}

export const REQUEST_NEW_LABEL = 'Новая';
export const REQUEST_UNDER_REVIEW_LABEL = 'На рассмотрении';
export const REQUEST_REJECTED_LABEL = 'Отклонена';

/** Единственное место правила вывода статуса заявки для автора. */
export const RequestStatusPolicy = {
    statusOf(decision: RequestDecision, skillStatus: SkillStatus | null): RequestStatus {
        switch (decision.kind) {
            case 'new':
                return { code: 'new', label: REQUEST_NEW_LABEL };
            case 'under_review':
                return { code: 'under_review', label: REQUEST_UNDER_REVIEW_LABEL };
            case 'rejected':
                return { code: 'rejected', label: REQUEST_REJECTED_LABEL };
            case 'accepted':
                if (skillStatus === null) throw new RequestIntegrityError('accepted');
                return { code: skillStatus, label: SKILL_STATUS_LABELS[skillStatus] };
        }
    },
};
