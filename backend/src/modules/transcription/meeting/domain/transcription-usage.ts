/** Сколько секунд аудио провайдер расшифровал и сколько это стоило (в валюте счёта OpenRouter). */
export interface TranscriptionUsage {
    readonly seconds: number;
    readonly cost: number;
}

export const TranscriptionUsage = {
    zero(): TranscriptionUsage {
        return { seconds: 0, cost: 0 };
    },

    add(total: TranscriptionUsage, part: TranscriptionUsage | null): TranscriptionUsage {
        if (part === null) return total;
        return { seconds: total.seconds + part.seconds, cost: total.cost + part.cost };
    },
};
