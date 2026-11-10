import type { DispatchOutcome } from '../bot-update-dispatcher';

export abstract class TelegramUpdateMetricsPort {
    abstract recordUpdate(result: DispatchOutcome): void;
}
