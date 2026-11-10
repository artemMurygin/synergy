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
