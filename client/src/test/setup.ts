import '@testing-library/jest-dom'
import { expect, vi } from 'vitest'
import * as matchers from 'vitest-axe/matchers'
import type { AxeMatchers } from 'vitest-axe'

expect.extend(matchers)

// jsdom doesn't implement these browser APIs; some Headless UI components
// (e.g. Combobox anchoring / option activation) call them, throwing otherwise.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Assertion<T> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
