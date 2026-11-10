export interface LinkResult {
    readonly kind: 'linked';
    readonly login: string;
    readonly previousChatId: bigint | null;
}
