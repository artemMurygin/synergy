/** `run` is an answer to a question (or the question itself), `system` is posted on a domain event. */
export const MESSAGE_SOURCES = ['run', 'system'] as const;

export type MessageSource = (typeof MESSAGE_SOURCES)[number];
