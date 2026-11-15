import type { LinkedRequestSnapshot } from '../../contracts/linked-request-snapshot';
import type { IdeaRequest } from '../idea-request';
import type { RequestStatusKind } from '../request-decision';

export abstract class RequestRepository {
    /**
     * Без `expected` — вставка новой заявки (`new`). С `expected` — условное обновление
     * `WHERE decision = expected`; 0 строк → перечитать и бросить `RequestNotFoundError`,
     * `RequestAlreadyTakenError` (ожидалась `new`, фактически `under_review`) или
     * `RequestAlreadyDecidedError`.
     */
    abstract save(request: IdeaRequest, expected?: RequestStatusKind): Promise<void>;
    abstract findById(id: string): Promise<IdeaRequest | null>;
    /** Снимок принятых заявок навыка; читается в той же транзакции, что смена статуса. */
    abstract listLinkedToSkill(skillId: string): Promise<LinkedRequestSnapshot[]>;
}
