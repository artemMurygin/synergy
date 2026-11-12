/** Any failure of a backend call; the message is safe to show to the user. */
export class BackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The server does not know the thread (HTTP 404). */
export class ThreadNotFoundError extends BackendError {}

/** The thread already has an active run (HTTP 409). */
export class RunConflictError extends BackendError {}

/** The server does not know the task or attachment (HTTP 404). */
export class TaskNotFoundError extends BackendError {}

/** The assignee or a watcher does not exist or is inactive (HTTP 422, code TASK_USER_NOT_FOUND). */
export class TaskUserNotFoundError extends BackendError {}

/** The file exceeds the server size limit (HTTP 413). */
export class AttachmentTooLargeError extends BackendError {}

/** The task already has the maximum number of attachments (HTTP 422, code TASK_ATTACHMENT_LIMIT). */
export class AttachmentLimitError extends BackendError {}

export class NotificationNotFoundError extends BackendError {}

export class TelegramNotConfiguredError extends BackendError {}

export class TelegramNotLinkedError extends BackendError {}

/** The stored file does not exist or belongs to another user (HTTP 404, code FILE_NOT_FOUND). */
export class FileNotFoundError extends BackendError {}

/** The stored file is deleted, its retention period is over (HTTP 410, code FILE_GONE). */
export class FileGoneError extends BackendError {}

/** The server rejected the file content type (HTTP 415, code FILE_UNSUPPORTED_MEDIA_TYPE). */
export class UnsupportedFileTypeError extends BackendError {}

/** The file is over the server limit for its kind (HTTP 413, code FILE_TOO_LARGE). */
export class FileTooLargeError extends BackendError {
  /** The limit in bytes when the server named it; null otherwise. */
  readonly maxBytes: number | null;

  constructor(message: string, maxBytes: number | null) {
    super(message);
    this.maxBytes = maxBytes;
  }
}
