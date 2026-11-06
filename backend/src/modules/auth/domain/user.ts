import type { Login } from './login';
import type { PasswordHash } from './password-hash';

export interface UserProps {
    id: string;
    login: Login;
    passwordHash: PasswordHash;
    mustChangePassword: boolean;
    isActive: boolean;
    createdAt: Date;
    passwordChangedAt: Date;
}

export class User {
    private constructor(private props: UserProps) {}

    static createWithTemporaryPassword(input: {
        id: string;
        login: Login;
        passwordHash: PasswordHash;
        now: Date;
    }): User {
        return new User({
            id: input.id,
            login: input.login,
            passwordHash: input.passwordHash,
            mustChangePassword: true,
            isActive: true,
            createdAt: input.now,
            passwordChangedAt: input.now,
        });
    }

    static restore(props: UserProps): User {
        return new User({ ...props });
    }

    get id(): string {
        return this.props.id;
    }
    get login(): Login {
        return this.props.login;
    }
    get passwordHash(): PasswordHash {
        return this.props.passwordHash;
    }
    get mustChangePassword(): boolean {
        return this.props.mustChangePassword;
    }
    get isActive(): boolean {
        return this.props.isActive;
    }
    get createdAt(): Date {
        return this.props.createdAt;
    }
    get passwordChangedAt(): Date {
        return this.props.passwordChangedAt;
    }

    canSignIn(): boolean {
        return this.props.isActive;
    }

    deactivate(): void {
        this.props.isActive = false;
    }

    changePassword(hash: PasswordHash, now: Date): void {
        this.props.passwordHash = hash;
        this.props.mustChangePassword = false;
        this.props.passwordChangedAt = now;
    }
}
