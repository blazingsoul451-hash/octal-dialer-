import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Octal Dialer frontend.
 *
 * Scope: UI smoke + responsive layout assertions. These tests exist to catch
 * the class of defect that screenshots and typechecks both miss — bounding-box
 * collisions, horizontal page overflow, window-scroll drift, and API routes
 * that 404 while the page still looks correct (the /api/dnc regression).
 *
 * Run:  npm run test:e2e:ui
 */
export default defineConfig({
  testDir: './e2e',
  // Layout assertions are order-independent; run them in parallel.
  fullyParallel: true,
  // A flaky layout test is a real bug, not noise — never auto-retry locally.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    // Keep artifacts only for failures so a green run leaves nothing behind.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  /**
   * Boot the Vite dev server unless one is already listening. The backend is
   * NOT started here: tests that need live data skip themselves when the API
   * is unreachable, so the suite stays runnable without a database.
   */
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
