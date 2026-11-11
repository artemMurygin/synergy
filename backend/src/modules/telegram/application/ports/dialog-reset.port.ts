import type { LinkedBotSender } from '../../domain/bot-sender';

export abstract class DialogResetPort {
    /** Removes the agent dialog of the user with its history; does nothing without a dialog. */
    abstract reset(sender: LinkedBotSender): Promise<void>;
}
