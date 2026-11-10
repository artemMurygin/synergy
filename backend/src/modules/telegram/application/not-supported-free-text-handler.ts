import { Injectable } from '@nestjs/common';
import { BotReplies } from './bot-replies';
import { FreeTextHandlerPort } from './ports/free-text-handler.port';

@Injectable()
export class NotSupportedFreeTextHandler extends FreeTextHandlerPort {
    handle(): Promise<string> {
        return Promise.resolve(BotReplies.freeTextNotSupported());
    }
}
