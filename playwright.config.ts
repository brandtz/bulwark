/**
 * playwright.config.ts — Bulwark E2E config
 *
 * What this file does:
 *   - Boots `pnpm dev` against the mock backend and runs Playwright specs in
 *     tests/e2e/.
 *   - Configures three projects: Chromium desktop, Mobile Safari (390x844),
 *     Mobile Chrome — covering the device matrix per BULWARK_TECH §10.
 *
 * Decisions captured here:
 *   - ADR-0007: a Playwright spec is required per UI-affecting story.
 *   - We reuse the Nuxt dev server in CI rather than `nuxt build && preview`.
 *     Tradeoff: dev mode is slower per page; but we get HMR-quality stack
 *     traces on failure, which matters for an agent-driven build.
 *
 * Decisions NOT taken:
 *   - We do NOT enable the Playwright Vue plugin yet — we test through the
 *     real browser, not against mounted components. Component-level testing
 *     lives in Vitest (vitest.config.ts).
 *   - We do NOT wire visual regression (e.g. percy) for MVP. Revisit at
 *     Phase 2 once UI churn slows.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  // Real-backend mode shares a single Postgres database across all workers;
  // some specs are intentionally destructive (auth-recovery, settings) and
  // race against parallel readers. Pin to a single worker / no parallelism
  // when BULWARK_BACKEND=real to keep the suite deterministic.
  fullyParallel: process.env.BULWARK_BACKEND !== 'real',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.BULWARK_BACKEND === 'real' ? 1 : process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // Cold-start of Nuxt 3.21 dev with 60+ routes + Vite scan regularly
    // exceeds 2 minutes on dev hardware; bump to 5 minutes so the e2e
    // suite isn't gated by webServer-spawn latency.
    timeout: 300_000,
    env: {
      // ADR-0015 / EH-C: real backend is the runtime default. Mock survives
      // as an explicit opt-in (BULWARK_BACKEND=mock) for offline dev runs.
      BULWARK_BACKEND: process.env.BULWARK_BACKEND || 'real',
      // W5-1 / EH-R: the login rate-limiter (5/min per IP) hammers the e2e
      // suite, which authenticates as ~12 personas back-to-back. Default
      // the bypass ON in playwright so specs don't have to sleep; explicit
      // opt-out with BULWARK_RATE_LIMIT_DISABLED=0 if a spec wants to
      // exercise the limiter itself.
      BULWARK_RATE_LIMIT_DISABLED: process.env.BULWARK_RATE_LIMIT_DISABLED ?? '1',
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
      ...(process.env.NUXT_SESSION_PASSWORD ? { NUXT_SESSION_PASSWORD: process.env.NUXT_SESSION_PASSWORD } : {}),
      ...(process.env.JWT_SECRET ? { JWT_SECRET: process.env.JWT_SECRET } : {}),
      ...(process.env.BULWARK_PDF_STUB ? { BULWARK_PDF_STUB: process.env.BULWARK_PDF_STUB } : {}),
    },
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
})
