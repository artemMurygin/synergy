import type { Email } from '../email';
import type { EmployeeProfile } from '../employee-profile';

export abstract class UserProfileRepository {
    /** Null when the user has no profile row (an empty profile). */
    abstract findByUserId(userId: string): Promise<EmployeeProfile | null>;
    /** Inserts or updates by user id. */
    abstract save(profile: EmployeeProfile): Promise<void>;
    /** Case-insensitive; the profile of exceptUserId is ignored. */
    abstract isEmailTaken(email: Email, exceptUserId?: string): Promise<boolean>;
}
