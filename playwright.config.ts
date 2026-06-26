import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the lesson and auth flows (AGENTS.md). These exercise the
 * app as a guest against a real Vite dev server — they deliberately avoid
 * depending on a live Firebase project, so they pass in CI without secrets:
 * the sign-in surfaces and gated profile render regardless of auth config.
 */
const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
