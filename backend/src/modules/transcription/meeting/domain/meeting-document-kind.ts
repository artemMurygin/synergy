/** Вид документа встречи: закрытое множество для имени файла и лога. */
export const MEETING_DOCUMENT_KINDS = ['transcript', 'tasks'] as const;

export type MeetingDocumentKind = (typeof MEETING_DOCUMENT_KINDS)[number];

const FILE_NAME_PREFIX: Readonly<Record<MeetingDocumentKind, string>> = Object.freeze({
    transcript: 'Расшифровка',
    tasks: 'Задачи',
});

/** «Расшифровка — <имя записи без расширения><ext>». */
export function meetingDocumentFileName(
    kind: MeetingDocumentKind,
    recordingName: string,
    extension: string,
): string {
    return `${FILE_NAME_PREFIX[kind]} — ${recordingBaseName(recordingName)}${extension}`;
}

/** Заголовок документа: «Расшифровка — <имя записи без расширения>». */
export function meetingDocumentTitle(kind: MeetingDocumentKind, recordingName: string): string {
    return `${FILE_NAME_PREFIX[kind]} — ${recordingBaseName(recordingName)}`;
}

/** Имя записи без последнего расширения; имя без точки или с точкой в начале не меняется. */
export function recordingBaseName(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
}
