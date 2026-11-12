import type { AttachmentRef } from '../../../../shared/agent-capability';

/** Files of the user that can be attached to a chat message. */
export abstract class AttachmentFilesPort {
    /**
     * All files must be own and active. The order is the input order.
     * Throws ChatAttachmentNotFoundError (unknown or foreign) or ChatAttachmentExpiredError (deleted).
     */
    abstract findOwned(ownerId: string, fileIds: readonly string[]): Promise<AttachmentRef[]>;
}
