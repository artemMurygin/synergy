import type { PinoLogger } from 'nestjs-pino';
import type { ReleaseFileHoldUseCase } from '../../../files/application/release-file-hold.use-case';

// Сбой снятия удержания не теряет расшифровку: запись удалится по максимуму удержания.
export async function releaseHoldSafely(
    releaseHold: ReleaseFileHoldUseCase,
    logger: PinoLogger,
    fileId: string,
): Promise<void> {
    try {
        await releaseHold.execute(fileId);
    } catch (error: unknown) {
        logger.error({ fileId, err: error }, 'Failed to release the recording hold');
    }
}
