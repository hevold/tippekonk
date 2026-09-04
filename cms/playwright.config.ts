import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    locale: 'nb-NO',
    timezoneId: 'Europe/Oslo',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NODE_ENV: 'production',
      PGLITE_DIR: './data/e2e-pglite',
      UPLOAD_DIR: './data/e2e-uploads',
      APP_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0000',
      APP_URL: baseURL,
      ENABLE_INTERNAL_SCHEDULER: 'false',
    },
  },
});
