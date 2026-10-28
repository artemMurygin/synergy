import { ArgumentNotProvidedError } from '../errors';
import { Guard } from './guard';
import { convertPropsToObject } from './props-to-object';

export type Primitives = string | number | boolean;

export interface DomainPrimitive<TValue extends Primitives | Date> {
    value: TValue;
}

type ValueObjectProps<T> = T extends Primitives | Date ? DomainPrimitive<T> : T;

function isDomainPrimitive(props: unknown): props is DomainPrimitive<Primitives | Date> {
    return typeof props === 'object' && props !== null && 'value' in props;
}

export abstract class ValueObject<T> {
    protected readonly props: ValueObjectProps<T>;

    constructor(props: ValueObjectProps<T>) {
        this.checkIfEmpty(props);
        this.validate(props);
        this.props = props;
    }

    protected abstract validate(props: ValueObjectProps<T>): void;

    equals(other?: ValueObject<T>): boolean {
        if (other === undefined) {
            return false;
        }
        return JSON.stringify(this) === JSON.stringify(other);
    }

    unpack(): unknown {
        if (isDomainPrimitive(this.props)) {
            return this.props.value;
        }
        if (typeof this.props !== 'object' || this.props === null) {
            return this.props;
        }
        return Object.freeze(convertPropsToObject(this.props));
    }

    private checkIfEmpty(props: ValueObjectProps<T>): void {
        if (Guard.isEmpty(props) || (isDomainPrimitive(props) && Guard.isEmpty(props.value))) {
            throw new ArgumentNotProvidedError('Property cannot be empty');
        }
    }
}
