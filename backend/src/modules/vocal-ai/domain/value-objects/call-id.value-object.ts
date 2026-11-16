import { ValueObject } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';

export class CallId extends ValueObject<number> {
    constructor(value: number) {
        super({ value });
        Object.freeze(this);
    }

    get value(): number {
        return this.props.value;
    }

    protected validate({ value }: { value: number }): void {
        if (!Number.isInteger(value) || value <= 0) {
            throw new ArgumentInvalidError('Call id must be a positive integer');
        }
    }
}
