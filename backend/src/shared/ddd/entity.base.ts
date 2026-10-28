import { ArgumentNotProvidedError, ArgumentOutOfRangeError } from '../errors';
import { Guard } from './guard';
import { convertPropsToObject } from './props-to-object';

const MAX_PROPS = 50;

export type AggregateId = string;

export interface BaseEntityProps {
    id: AggregateId;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateEntityProps<TProps> {
    id: AggregateId;
    props: TProps;
    createdAt?: Date;
    updatedAt?: Date;
}

export abstract class Entity<TProps extends object> {
    readonly id: AggregateId;

    readonly createdAt: Date;

    protected readonly props: TProps;

    private modifiedAt: Date;

    constructor({ id, createdAt, updatedAt, props }: CreateEntityProps<TProps>) {
        this.validateProps(props);
        const now = new Date();
        this.id = id;
        this.createdAt = createdAt ?? now;
        this.modifiedAt = updatedAt ?? now;
        this.props = props;
        this.validate();
    }

    get updatedAt(): Date {
        return this.modifiedAt;
    }

    abstract validate(): void;

    equals(other?: Entity<TProps>): boolean {
        if (other === undefined) {
            return false;
        }
        return this === other || this.id === other.id;
    }

    getProps(): TProps & BaseEntityProps {
        return Object.freeze({
            id: this.id,
            createdAt: this.createdAt,
            updatedAt: this.modifiedAt,
            ...this.props,
        });
    }

    toObject(): Readonly<Record<string, unknown>> {
        return Object.freeze({
            id: this.id,
            createdAt: this.createdAt,
            updatedAt: this.modifiedAt,
            ...convertPropsToObject(this.props),
        });
    }

    protected touch(): void {
        this.modifiedAt = new Date();
    }

    private validateProps(props: TProps): void {
        if (Guard.isEmpty(props)) {
            throw new ArgumentNotProvidedError('Entity props should not be empty');
        }
        if (Object.keys(props).length > MAX_PROPS) {
            throw new ArgumentOutOfRangeError(
                `Entity props should not have more than ${String(MAX_PROPS)} properties`,
            );
        }
    }
}
