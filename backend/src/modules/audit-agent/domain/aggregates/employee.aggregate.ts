import { AggregateRoot } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';

export interface EmployeeProps {
    crmResponsibleId: string;
    fullName: string;
    telegramUsername: string | null;
    telegramChatId: string | null;
    isActive: boolean;
}

export interface CreateEmployeeProps extends EmployeeProps {
    id: string;
}

export class Employee extends AggregateRoot<EmployeeProps> {
    static create({ id, ...props }: CreateEmployeeProps): Employee {
        return new Employee({ id, props });
    }

    get crmResponsibleId(): string {
        return this.props.crmResponsibleId;
    }

    get fullName(): string {
        return this.props.fullName;
    }

    get telegramUsername(): string | null {
        return this.props.telegramUsername;
    }

    get telegramChatId(): string | null {
        return this.props.telegramChatId;
    }

    get isActive(): boolean {
        return this.props.isActive;
    }

    canBeNotified(): boolean {
        return this.props.isActive && this.props.telegramChatId !== null;
    }

    validate(): void {
        if (this.props.crmResponsibleId.trim() === '') {
            throw new ArgumentInvalidError('Employee CRM responsible id must not be blank');
        }
    }
}
