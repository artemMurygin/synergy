import type { Role } from '../role';
import type { Login } from '../login';
import type { User } from '../user';
import type { UserSearch } from '../user-search';
import type { UserSummary } from '../user-summary';

export abstract class UserRepository {
    abstract findByLogin(login: Login): Promise<User | null>;
    abstract findById(id: string): Promise<User | null>;
    /** Inserts or updates by id. */
    abstract save(user: User): Promise<void>;
    /** Roles currently assigned to the user, from the database. */
    abstract findRoles(userId: string): Promise<Role[]>;
    /** Idempotent: an already assigned role is left as is. */
    abstract assignRoles(userId: string, roles: Role[]): Promise<void>;
    /** Replaces the whole role set in one transaction; an empty set removes every role. */
    abstract replaceRoles(userId: string, roles: Role[]): Promise<void>;
    /** Updates only is_active; other columns are left untouched. */
    abstract setActive(userId: string, active: boolean): Promise<void>;
    /** Number of active users that have the admin role. */
    abstract countActiveAdmins(): Promise<number>;
    abstract existsByLogin(login: Login): Promise<boolean>;
    /** Active users whose login contains the search text, ordered by login, with the overall total. */
    abstract searchActive(
        search: UserSearch,
        limit: number,
        offset: number,
    ): Promise<{ items: UserSummary[]; total: number }>;
}
