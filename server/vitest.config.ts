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
    // Integration tests share a single SQLite database; running test files
    // sequentially avoids destructive deleteMany({}) calls in one suite wiping
    // data another suite depends on mid-test.
    fileParallelism: false,
  },
})