export interface TokenPair {
    access: string;
    /** Access token lifetime in seconds. */
    expiresIn: number;
    refresh: string;
    mustChangePassword: boolean;
}
