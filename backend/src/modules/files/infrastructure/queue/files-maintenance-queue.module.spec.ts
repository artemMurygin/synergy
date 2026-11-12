import { describe, expect, it } from 'vitest';
import { FILES_QUEUE_NAMES } from './files-queue.constants';
import { FilesMaintenanceQueueModule } from './files-maintenance-queue.module';

describe('FilesMaintenanceQueueModule', () => {
    it('uses the files-maintenance queue', () => {
        expect(FILES_QUEUE_NAMES.MAINTENANCE).toBe('files-maintenance');
    });

    it('registers its queue through BullModule.registerQueueAsync', () => {
        const imports: unknown = Reflect.getMetadata('imports', FilesMaintenanceQueueModule);
        expect(imports).toHaveLength(1);
        expect(JSON.stringify(imports)).toContain('files-maintenance');
    });
});
