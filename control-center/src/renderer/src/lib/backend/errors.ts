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
