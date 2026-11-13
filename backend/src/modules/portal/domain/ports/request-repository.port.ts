import type { LinkedRequestSnapshot } from '../../contracts/linked-request-snapshot';
import type { IdeaRequest } from '../idea-request';

export abstract class RequestRepository {
    /**
     * Новая заявка (`pending`) вставляется; заявка с решением обновляется условно
     * (`WHERE decision = 'pending'`): 0 строк → `RequestAlreadyDecidedError`.
     */
    abstract save(request: IdeaRequest): Promise<void>;
    abstract findById(id: string): Promise<IdeaRequest | null>;
    /** Снимок принятых заявок навыка; читается в той же транзакции, что смена статуса. */
    abstract listLinkedToSkill(skillId: string): Promise<LinkedRequestSnapshot[]>;
}
