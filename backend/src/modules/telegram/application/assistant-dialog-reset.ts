import { Injectable } from '@nestjs/common';
import { ResetTelegramDialogUseCase } from '../../assistant/application/reset-telegram-dialog.use-case';
import type { LinkedBotSender } from '../domain/bot-sender';
import { DialogResetPort } from './ports/dialog-reset.port';

/** /new removes the Telegram dialog of the user in the assistant. */
@Injectable()
export class AssistantDialogReset extends DialogResetPort {
    constructor(private readonly resetDialog: ResetTelegramDialogUseCase) {
        super();
    }

    reset(sender: LinkedBotSender): Promise<void> {
        return this.resetDialog.execute(sender.userId);
    }
}
