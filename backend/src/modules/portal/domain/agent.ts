import { AggregateRoot } from '../../../shared/ddd';
import { ArgumentInvalidError } from '../../../shared/errors';
import { AgentArchivedError } from './errors';

export interface AgentProps {
    slug: string;
    name: string;
    /** Продукты агента; список непустой. */
    productIds: readonly string[];
    archivedAt: Date | null;
}

export interface CreateAgentInput {
    id: string;
    slug: string;
    name: string;
    productIds: readonly string[];
    now: Date;
}

export interface RestoreAgentInput extends AgentProps {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}

/** Агент продукта; может принадлежать нескольким продуктам и уходить в архив. */
export class Agent extends AggregateRoot<AgentProps> {
    static create(input: CreateAgentInput): Agent {
        return new Agent({
            id: input.id,
            createdAt: input.now,
            updatedAt: input.now,
            props: {
                slug: input.slug,
                name: input.name,
                productIds: [...input.productIds],
                archivedAt: null,
            },
        });
    }

    static restore({ id, createdAt, updatedAt, ...props }: RestoreAgentInput): Agent {
        return new Agent({ id, createdAt, updatedAt, props: { ...props } });
    }

    get slug(): string {
        return this.props.slug;
    }

    get name(): string {
        return this.props.name;
    }

    get productIds(): readonly string[] {
        return this.props.productIds;
    }

    get archivedAt(): Date | null {
        return this.props.archivedAt;
    }

    /** Возвращает, изменилось ли состояние. */
    archive(now: Date): boolean {
        if (this.props.archivedAt !== null) return false;
        this.props.archivedAt = now;
        this.touch();
        return true;
    }

    /** Возвращает, изменилось ли состояние. */
    restore(): boolean {
        if (this.props.archivedAt === null) return false;
        this.props.archivedAt = null;
        this.touch();
        return true;
    }

    ensureActive(): void {
        if (this.props.archivedAt !== null) throw new AgentArchivedError(this.id);
    }

    validate(): void {
        if (this.props.productIds.length === 0) {
            throw new ArgumentInvalidError('Agent must belong to at least one product');
        }
    }
}
