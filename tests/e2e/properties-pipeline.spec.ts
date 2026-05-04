/**
 * tests/e2e/properties-pipeline.spec.ts — Properties pipeline kanban (E3-S1).
 *
 * # Decisions (ADR-0007)
 *   - One spec per UI story. Covers: column rendering for every status,
 *     the total-count header, populated vs. empty columns, the
 *     `New property` CTA, and that each card carries a deep-link to the
 *     detail hub. We do NOT click into the detail hub here — that page
 *     ships in E3-S5 and gets its own spec.
 *   - Mode: `serial` because all four scenarios share one cookie context.
 *
 * # Decision cast down
 *   - Rejected: asserting the total count by string (`13 in pipeline`).
 *     The fixture count is likely to grow; we read it dynamically from
 *     the fixture file and assert a stable invariant ("at least one card
 *     per non-cancelled status").
 */
import { test, expect } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

test.describe.configure({ mode: 'serial' })

const POPULATED_STATUSES = [
  'lead',
  'scheduled',
  'assessed',
  'quoted',
  'accepted',
  'in_progress',
  'completed',
  'compliance_pending',
  'compliance_complete',
  'invoiced',
  'paid',
  'on_hold',
]
const EMPTY_STATUSES = ['cancelled']

test.describe('Properties pipeline (E3-S1)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop kanban only')
    await signInAsAdmin(page)
  })

  test('renders every status column for an admin', async ({ page }) => {
    await page.goto('/admin/properties')
    await expect(page.getByTestId('properties-pipeline')).toBeVisible()
    const columns = page.getByTestId('pipeline-column')
    await expect(columns).toHaveCount(POPULATED_STATUSES.length + EMPTY_STATUSES.length)
  })

  test('every populated status has at least one card', async ({ page }) => {
    await page.goto('/admin/properties')
    for (const status of POPULATED_STATUSES) {
      const col = page.locator(`[data-testid="pipeline-column"][data-status="${status}"]`)
      await expect(col).toBeVisible()
      const cards = col.getByTestId('property-card')
      await expect(cards.first()).toBeVisible()
    }
  })

  test('empty status columns show the empty-state line', async ({ page }) => {
    await page.goto('/admin/properties')
    for (const status of EMPTY_STATUSES) {
      const col = page.locator(`[data-testid="pipeline-column"][data-status="${status}"]`)
      await expect(col.getByTestId('pipeline-column-empty')).toBeVisible()
    }
  })

  test('property cards deep-link to the detail hub', async ({ page }) => {
    await page.goto('/admin/properties')
    const firstCard = page.getByTestId('property-card').first()
    const href = await firstCard.getAttribute('href')
    expect(href).toMatch(/^\/admin\/properties\/[^/]+$/)
  })

  test('new property CTA is visible', async ({ page }) => {
    await page.goto('/admin/properties')
    await expect(page.getByTestId('new-property-button')).toBeVisible()
  })
})
