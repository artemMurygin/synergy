import type { DepartmentName } from './department-name';

export interface DepartmentProps {
    id: string;
    name: DepartmentName;
    headUserId?: string;
}

/** Department of the flat directory with an optional head. */
export class Department {
    private constructor(private props: DepartmentProps) {}

    static create(props: DepartmentProps): Department {
        return new Department({ ...props });
    }

    static restore(props: DepartmentProps): Department {
        return new Department({ ...props });
    }

    get id(): string {
        return this.props.id;
    }
    get name(): DepartmentName {
        return this.props.name;
    }
    get headUserId(): string | undefined {
        return this.props.headUserId;
    }

    rename(name: DepartmentName): void {
        this.props.name = name;
    }

    assignHead(userId: string): void {
        this.props.headUserId = userId;
    }

    clearHead(): void {
        this.props.headUserId = undefined;
    }
}
