export interface DeliveryReservationRequest {
    readonly notificationId: string;
    readonly userId: string;
    readonly now: Date;
    readonly reservationMs: number;
}

export interface DeliveryInProgress {
    readonly inProgressUntil: Date;
}

export type DeliveryReservation = 'reserved' | 'done' | DeliveryInProgress;

export interface SentDelivery {
    readonly notificationId: string;
    readonly messageId: bigint;
    readonly sentAt: Date;
}

export abstract class TelegramDeliveryLogPort {
    abstract reserve(request: DeliveryReservationRequest): Promise<DeliveryReservation>;

    abstract markSent(delivery: SentDelivery): Promise<void>;

    abstract markSkipped(notificationId: string): Promise<void>;

    abstract release(notificationId: string): Promise<void>;
}
