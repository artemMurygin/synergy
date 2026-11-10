export abstract class NotificationChannelMetricsPort {
    abstract recordFailure(channel: string): void;
}
