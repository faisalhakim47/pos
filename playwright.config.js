// @ts-check

import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173',
    video: 'on-first-retry',
    trace: 'on-first-retry',
    hasTouch: false,
    viewport: {
      width: 1368,
      height: 768,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    url: 'http://localhost:5173',
    command: 'npm run dev',
    reuseExistingServer: !process.env.CI,
  },
});
