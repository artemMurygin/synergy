import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

Element.prototype.scrollIntoView = () => undefined

// assistant-ui measures the viewport and the composer; jsdom has no ResizeObserver.
globalThis.ResizeObserver = class {
  observe() {
    return undefined
  }
  unobserve() {
    return undefined
  }
  disconnect() {
    return undefined
  }
}
