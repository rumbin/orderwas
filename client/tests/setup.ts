import '@testing-library/jest-dom'

// jsdom doesn't implement window.scrollTo — stub it to avoid noise
window.scrollTo = () => {}
