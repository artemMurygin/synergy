import { AggregateRoot } from '../../../shared/ddd';
import { InvalidSkillTransitionError } from './errors';
import { SkillStatus } from './skill-status';
import type { SkillName } from './skill-name';

export interface SkillProps {
    agentId: string;
    name: SkillName;
    description: string;
    status: SkillStatus;
    statusChangedAt: Date;
}

export interface CreateSkillInput {
    id: string;
    agentId: string;
    name: SkillName;
    description?: string;
    now: Date;
}

export interface RestoreSkillInput extends SkillProps {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}

export class Skill extends AggregateRoot<SkillProps> {
    /** Новый навык всегда `planned`. */
    static create(input: CreateSkillInput): Skill {
        return new Skill({
            id: input.id,
            createdAt: input.now,
            updatedAt: input.now,
            props: {
                agentId: input.agentId,
                name: input.name,
                description: input.description ?? '',
                status: 'planned',
                statusChangedAt: input.now,
            },
        });
    }

    static restore({ id, createdAt, updatedAt, ...props }: RestoreSkillInput): Skill {
        return new Skill({ id, createdAt, updatedAt, props: { ...props } });
    }

    get agentId(): string {
        return this.props.agentId;
    }

    get name(): SkillName {
        return this.props.name;
    }

    get description(): string {
        return this.props.description;
    }

    get status(): SkillStatus {
        return this.props.status;
    }

    get statusChangedAt(): Date {
        return this.props.statusChangedAt;
    }

    /** Только соседний статус вперёд; иначе состояние не меняется. */
    advance(to: SkillStatus, now: Date): void {
        if (!SkillStatus.canAdvanceTo(this.props.status, to)) {
            throw new InvalidSkillTransitionError(this.props.status, to);
        }
        this.props.status = to;
        this.props.statusChangedAt = now;
        this.touch();
    }

    validate(): void {
        // Инварианты обеспечивают VO и `advance`.
    }
}
