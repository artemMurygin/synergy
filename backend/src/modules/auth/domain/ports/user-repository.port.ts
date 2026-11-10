import type { Login } from '../login';
import type { User } from '../user';
import type { UserSearch } from '../user-search';
import type { UserSummary } from '../user-summary';

export abstract class UserRepository {
    abstract findByLogin(login: Login): Promise<User | null>;
    abstract findById(id: string): Promise<User | null>;
    /** Inserts or updates by id. */
    abstract save(user: User): Promise<void>;
    abstract existsByLogin(login: Login): Promise<boolean>;
    /** Active users whose login contains the search text, ordered by login, with the overall total. */
    abstract searchActive(
        search: UserSearch,
        limit: number,
        offset: number,
    ): Promise<{ items: UserSummary[]; total: number }>;
}
