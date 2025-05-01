// @ts-check

import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const __dirname = new URL('.', import.meta.url).pathname;

export default defineConfig({
  testDir: join(__dirname, 'tests'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: process.env.CI ? 'on-first-retry' : 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ]
});
