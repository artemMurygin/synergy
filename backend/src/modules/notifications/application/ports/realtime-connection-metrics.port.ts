export abstract class RealtimeConnectionMetricsPort {
    abstract connectionOpened(): void;

    abstract connectionClosed(): void;
}
