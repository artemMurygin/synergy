export interface OrderBy {
    field: string;
    direction: 'asc' | 'desc';
}

export interface PaginatedQueryParams {
    limit: number;
    page: number;
    orderBy: OrderBy;
}

export class Paginated<T> {
    readonly count: number;
    readonly limit: number;
    readonly page: number;
    readonly items: readonly T[];

    constructor(props: Paginated<T>) {
        this.count = props.count;
        this.limit = props.limit;
        this.page = props.page;
        this.items = props.items;
    }
}

export interface RepositoryPort<TEntity> {
    insert(entity: TEntity | TEntity[]): Promise<void>;
    findOneById(id: string): Promise<TEntity | null>;
    findAllPaginated(params: PaginatedQueryParams): Promise<Paginated<TEntity>>;
    delete(entity: TEntity): Promise<boolean>;
    transaction<TResult>(handler: () => Promise<TResult>): Promise<TResult>;
}
