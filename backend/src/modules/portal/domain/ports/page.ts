export interface PageRequest {
    /** Размер страницы. */
    limit: number;
    /** Номер страницы с нуля. */
    page: number;
}

export interface Page<T> {
    items: T[];
    /** Число записей по запросу на всех страницах. */
    total: number;
}
