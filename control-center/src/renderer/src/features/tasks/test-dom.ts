/* eslint-disable @typescript-eslint/no-unnecessary-condition, @typescript-eslint/unbound-method -- test doubles: mocks, DOM stubs and fake transports of the test environment are typed loosely on purpose */
// jsdom lacks the browser APIs Radix popovers and dialogs rely on
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub
Element.prototype.scrollIntoView ??= () => {}
export {}
