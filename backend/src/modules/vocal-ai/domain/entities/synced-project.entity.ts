import { Entity } from '../../../../shared/ddd';
import { ArgumentInvalidError } from '../../../../shared/errors';
import { SyncCursorRegressionError } from '../errors';

export interface SyncedProjectProps {
    title: string;
    lastSyncedAt: Date | null;
}

export interface CreateSyncedProjectProps {
    projectId: string;
    title: string;
    lastSyncedAt?: Date | null;
}

export class SyncedProject extends Entity<SyncedProjectProps> {
    static create({
        projectId,
        title,
        lastSyncedAt = null,
    }: CreateSyncedProjectProps): SyncedProject {
        return new SyncedProject({ id: projectId, props: { title, lastSyncedAt } });
    }

    get projectId(): string {
        return this.id;
    }

    get title(): string {
        return this.props.title;
    }

    get lastSyncedAt(): Date | null {
        return this.props.lastSyncedAt;
    }

    advanceTo(syncedAt: Date): void {
        if (
            this.props.lastSyncedAt !== null &&
            syncedAt.getTime() < this.props.lastSyncedAt.getTime()
        ) {
            throw new SyncCursorRegressionError(
                'Synced project cursor must not move to an earlier instant than lastSyncedAt',
            );
        }
        this.props.lastSyncedAt = syncedAt;
        this.touch();
    }

    validate(): void {
        if (this.props.title.trim() === '') {
            throw new ArgumentInvalidError('Synced project title must not be blank');
        }
    }
}
