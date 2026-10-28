import { ArgumentInvalidError } from '../../../../shared/errors';
import { ValueObject } from '../../../../shared/ddd';

export class DealId extends ValueObject<string> {
    constructor(value: string) {
        super({ value });
        Object.freeze(this);
    }

    get value(): string {
        return this.props.value;
    }

    protected validate({ value }: { value: string }): void {
        if (value.trim() === '') {
            throw new ArgumentInvalidError('Deal id must not be blank');
        }
    }
}
