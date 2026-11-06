import type { Login } from '../login';
import type { User } from '../user';

export abstract class UserRepository {
    abstract findByLogin(login: Login): Promise<User | null>;
    abstract findById(id: string): Promise<User | null>;
    /** Inserts or updates by id. */
    abstract save(user: User): Promise<void>;
    abstract existsByLogin(login: Login): Promise<boolean>;
}
