/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unnecessary-condition -- test doubles: mocks, DOM stubs and fake transports of the test environment are typed loosely on purpose */
/** Minimal XMLHttpRequest stand-in for upload tests. */
export class FakeXhr {
  static last: FakeXhr;
  upload = {
    listeners: {} as Record<string, (event: unknown) => void>,
    addEventListener(type: string, listener: (event: unknown) => void) {
      this.listeners[type] = listener;
    },
  };
  listeners: Record<string, () => void> = {};
  status = 0;
  responseText = "";
  method = "";
  url = "";
  body: unknown = null;
  aborted = false;

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners[type] = listener;
  }

  send(body: unknown) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.listeners.abort?.();
  }

  progress(loaded: number, total: number, lengthComputable = true) {
    this.upload.listeners.progress?.({ lengthComputable, loaded, total });
  }

  finish(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.listeners.load?.();
  }

  fail() {
    this.listeners.error?.();
  }
}
