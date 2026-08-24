import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    testTimeout: 10000,
    // CSS: false avoids Tailwind JIT processing the massive color class set during tests,
    // which causes the vitest worker to hang when the CSS file exceeds memory thresholds.
    css: false,
  },
})