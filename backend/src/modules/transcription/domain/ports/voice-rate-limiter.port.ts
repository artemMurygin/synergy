export interface VoiceRateDecision {
    readonly allowed: boolean;
    /** Seconds until the window ends; 0 when allowed. */
    readonly retryAfterSec: number;
}

/** Limits how many voice transcriptions one user starts per minute. */
export abstract class VoiceRateLimiterPort {
    abstract acquire(userId: string): Promise<VoiceRateDecision>;
}
