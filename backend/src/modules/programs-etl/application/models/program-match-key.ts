import { ProgramsSyncError } from '../errors/programs-sync.error';
import { type ProgramLevel, parseProgramLevel } from '../../domain/value-objects/program-level';

export type ProgramMatchKey =
    | {
          readonly kind: 'coded';
          readonly organizationId: string;
          readonly level: ProgramLevel;
          readonly directionCode: string;
          readonly profile?: string;
          readonly qualification?: string;
      }
    | {
          readonly kind: 'titled';
          readonly organizationId: string;
          readonly level: ProgramLevel;
          readonly title: string;
      };

export interface ProgramMatchKeyInput {
    organizationId: string;
    level: string;
    directionCode?: string;
    profile?: string;
    qualification?: string;
    title?: string;
}

function present(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

/** `coded` when directionCode is present, otherwise `titled`. */
export function buildProgramMatchKey(input: ProgramMatchKeyInput): ProgramMatchKey {
    const level = parseProgramLevel(input.level);
    const directionCode = present(input.directionCode);
    if (directionCode !== undefined) {
        const profile = present(input.profile);
        const qualification = present(input.qualification);
        return {
            kind: 'coded',
            organizationId: input.organizationId,
            level,
            directionCode,
            ...(profile === undefined ? {} : { profile }),
            ...(qualification === undefined ? {} : { qualification }),
        };
    }
    const title = present(input.title);
    if (title === undefined) {
        throw new ProgramsSyncError(
            'INVALID_WORKFLOW_DATA',
            'Program match key needs directionCode or title',
        );
    }
    return { kind: 'titled', organizationId: input.organizationId, level, title };
}
