import { Email } from './email';
import { PersonName } from './person-name';

export interface EmployeeProfileProps {
    userId: string;
    name: PersonName;
    departmentId?: string;
    position?: string;
    email?: Email;
    scrmEmployeeId?: string;
}

/**
 * Partial profile update: an omitted field stays as is, an empty string or null clears an
 * optional field. Last and first name cannot be cleared.
 */
export interface ProfilePatch {
    lastName?: string;
    firstName?: string;
    middleName?: string | null;
    departmentId?: string | null;
    position?: string | null;
    email?: string | null;
    scrmEmployeeId?: string | null;
}

function cleaned(raw: string | null): string | undefined {
    if (raw === null) return undefined;
    const value = raw.trim();
    return value.length > 0 ? value : undefined;
}

/** HR data of an employee, 1:1 with the user. Not part of the User aggregate. */
export class EmployeeProfile {
    private constructor(private props: EmployeeProfileProps) {}

    static create(props: EmployeeProfileProps): EmployeeProfile {
        return new EmployeeProfile({ ...props });
    }

    static restore(props: EmployeeProfileProps): EmployeeProfile {
        return new EmployeeProfile({ ...props });
    }

    get userId(): string {
        return this.props.userId;
    }
    get name(): PersonName {
        return this.props.name;
    }
    get departmentId(): string | undefined {
        return this.props.departmentId;
    }
    get position(): string | undefined {
        return this.props.position;
    }
    get email(): Email | undefined {
        return this.props.email;
    }
    get scrmEmployeeId(): string | undefined {
        return this.props.scrmEmployeeId;
    }

    /** Validates everything first, so a rejected patch leaves the profile untouched. */
    applyPatch(patch: ProfilePatch): void {
        const current = this.props.name;
        const name =
            patch.lastName === undefined &&
            patch.firstName === undefined &&
            patch.middleName === undefined
                ? current
                : PersonName.of({
                      lastName: patch.lastName ?? current.lastName,
                      firstName: patch.firstName ?? current.firstName,
                      middleName:
                          patch.middleName === undefined ? current.middleName : patch.middleName,
                  });
        const email = patch.email === undefined ? this.props.email : Email.optional(patch.email);
        this.props = {
            ...this.props,
            name,
            email,
            departmentId:
                patch.departmentId === undefined
                    ? this.props.departmentId
                    : cleaned(patch.departmentId),
            position: patch.position === undefined ? this.props.position : cleaned(patch.position),
            scrmEmployeeId:
                patch.scrmEmployeeId === undefined
                    ? this.props.scrmEmployeeId
                    : cleaned(patch.scrmEmployeeId),
        };
    }
}
