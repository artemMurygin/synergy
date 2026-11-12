export const FILE_KINDS = ['recording', 'document'] as const;

export type FileKind = (typeof FILE_KINDS)[number];
