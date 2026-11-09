// jsdom lacks the browser APIs the assistant-ui viewport relies on
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub
Element.prototype.scrollTo ??= () => {}
