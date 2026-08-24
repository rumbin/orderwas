import '@testing-library/jest-dom'

// jsdom doesn't implement window.scrollTo — stub it to avoid noise
window.scrollTo = () => {}

// jsdom doesn't implement IntersectionObserver — stub it
if (typeof IntersectionObserver === 'undefined') {
  ;(globalThis as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
