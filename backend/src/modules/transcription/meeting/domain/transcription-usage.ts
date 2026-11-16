/**
 * Сколько секунд аудио провайдер расшифровал и сколько это стоило. Длительность известна всегда;
 * неизвестная стоимость — `null`, а не 0.
 */
export interface TranscriptionUsage {
    readonly seconds: number;
    readonly cost: number | null;
}

export const TranscriptionUsage = {
    zero(): TranscriptionUsage {
        return { seconds: 0, cost: 0 };
    },

    add(total: TranscriptionUsage, part: TranscriptionUsage | null): TranscriptionUsage {
        if (part === null) return total;
        const cost = total.cost === null || part.cost === null ? null : total.cost + part.cost;
        return { seconds: total.seconds + part.seconds, cost };
    },
};
