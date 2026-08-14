import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Auto-start backend + frontend for E2E, so `npm run ci` works unattended
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: '../server',
      port: 3000,
      timeout: 10000,
      reuseExistingServer: true,
    },
    {
      command: 'npx vite --port 5173',
      cwd: '../client',
      port: 5173,
      timeout: 10000,
      reuseExistingServer: true,
    },
  ],
})