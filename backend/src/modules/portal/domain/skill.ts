import { AggregateRoot } from '../../../shared/ddd';
import { InvalidSkillTransitionError, SkillArchivedError } from './errors';
import { SkillStatus } from './skill-status';
import type { SkillName } from './skill-name';

export interface SkillProps {
    agentId: string;
    name: SkillName;
    description: string;
    status: SkillStatus;
    statusChangedAt: Date;
    launchedAt: Date | null;
    archivedAt: Date | null;
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
                launchedAt: null,
                archivedAt: null,
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

    get launchedAt(): Date | null {
        return this.props.launchedAt;
    }

    get archivedAt(): Date | null {
        return this.props.archivedAt;
    }

    /** Переход по таблице; архивный навык не меняется; `launchedAt` пишется один раз. */
    changeStatus(to: SkillStatus, now: Date): void {
        if (this.props.archivedAt !== null) throw new SkillArchivedError(this.id);
        if (!SkillStatus.canMove(this.props.status, to)) {
            throw new InvalidSkillTransitionError(this.props.status, to);
        }
        this.props.status = to;
        this.props.statusChangedAt = now;
        if (to === 'launched') this.props.launchedAt ??= now;
        this.touch();
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

    validate(): void {
        // Инварианты обеспечивают VO и `changeStatus`.
    }
}
