import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level tests — the layer `docs/TESTS.md` has listed as owed since
 * M17 and `docs/PRODUCTION-AUDIT.md` names as item 21.
 *
 * The existing suites cover pure functions, services against a stub
 * Prisma, and HTTP against a real Nest app. None of them opens a page. The
 * 2026-08-07 audit found a class of bug that only a browser sees: a Save
 * button that does nothing and says nothing, a Place-order button that
 * charges twice when double-clicked, a product card that is focusable and
 * un-openable from a keyboard, and a modal that traps nothing. Every one
 * of those passed every test in the repo.
 *
 * **The servers are not started here.** A `webServer` block would need a
 * migrated, seeded database as a precondition, and hiding that inside a
 * test config is how it silently runs against whatever database happened
 * to be configured — including a developer's own. `docs/TESTS.md` documents
 * the two commands; CI runs them as explicit steps.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './tests',
  // Written to be independent, and a failure that only reproduces in
  // serial is a shared-state bug worth knowing about.
  fullyParallel: true,
  // A `.only` left in a spec silently disables the rest of the file. On CI
  // that is a green run that tested one thing.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    // On the first retry only — a trace for every passing test is a lot of
    // disk for nothing.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
      dependencies: ['setup'],
    },
    {
      /**
       * 390px, not 375: the app's own breakpoint work targets 360–430, and
       * the header collapses to the hamburger below ~1190px. This project
       * is where the drawer and the mobile layout are actually exercised —
       * on desktop the drawer is not rendered at all.
       */
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
      dependencies: ['setup'],
    },
  ],
});
