import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
    extensions: ['.ts', '.js', '.mjs', '.json'],
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
  },
})