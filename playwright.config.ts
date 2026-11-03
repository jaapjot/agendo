import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive a real browser against the real API and database.
 * `npm run test:e2e` starts both dev servers automatically (or reuses running ones).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run dev --workspace=apps/api',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev --workspace=apps/web',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
