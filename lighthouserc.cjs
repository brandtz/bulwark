/**
 * lighthouserc.cjs — Lighthouse CI budget gate (WP-L08 / epic L10-S1).
 *
 * Audits the ten most-used signed-in routes on the built server (CI job
 * `lighthouse`). The session comes from scripts/perf/lhci-session.mjs via
 * LHCI_COOKIE. Desktop preset, 3 runs per URL, median asserted.
 *
 * Budgets:
 *   - accessibility ≥ 0.95 and best-practices ≥ 0.9 are hard failures;
 *   - performance ≥ 0.7 fails (CI runners are noisy; the target is 0.9 —
 *     read the uploaded reports, and raise this floor as routes improve);
 *   - total JavaScript ≤ 700 KB and total transfer ≤ 1.25 MB per page fail, so a
 *     regressed bundle is caught even when the score stays green. Baseline
 *     2026-09-28 (local, desktop): JS 351–540 KB, total 727–973 KB, perf
 *     0.90–0.97, a11y 1.0, best-practices 0.96 on all ten routes.
 * Raise the floors as SCR packages land; never lower them without a note in
 * the WP.
 */
const base = process.env.LHCI_BASE_URL || 'http://localhost:3000'
const routes = [
  '/admin',
  '/admin/properties',
  '/admin/quotes',
  '/admin/invoices',
  '/admin/work-orders',
  '/admin/compliance',
  '/admin/clients',
  '/admin/dispatch',
  '/settings',
  '/profile',
]

module.exports = {
  ci: {
    collect: {
      url: routes.map((r) => base + r),
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH || undefined,
      settings: {
        preset: 'desktop',
        extraHeaders: process.env.LHCI_COOKIE ? { Cookie: process.env.LHCI_COOKIE } : undefined,
        chromeFlags: '--no-sandbox --headless=new',
      },
    },
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 0.95, aggregationMethod: 'median-run' }],
        'categories:best-practices': ['error', { minScore: 0.9, aggregationMethod: 'median-run' }],
        'categories:performance': ['error', { minScore: 0.7, aggregationMethod: 'median-run' }],
        'resource-summary:script:size': ['error', { maxNumericValue: 700 * 1024, aggregationMethod: 'median-run' }],
        'resource-summary:total:size': ['error', { maxNumericValue: 1250 * 1024, aggregationMethod: 'median-run' }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
  },
}
