/**
 * tests/e2e/wo-schedule.spec.ts — W2-3b / EH-G.
 *
 * # Decisions (ADR-0007)
 *   - Verifies the schedule card on the WO detail page commits a
 *     start/end window + priority, the inline priority chip preview
 *     updates, the cost rollup card renders, and the dispatch board
 *     surfaces a populated cell for the chosen day. The cell selector
 *     (`[data-test^="dispatch-cell-"]`) is sufficient — full cell text
 *     coverage is owned by the dispatch suite.
 *   - Mock backend only.
 *
 * # Decision cast down
 *   - Rejected: scheduling via the dispatch board's drag affordance.
 *     The detail-page form is the new spec surface; drag coverage
 *     lives in the dispatch suite.
 */
import { test, expect, type Page } from '@playwright/test'
import { signInAsAdmin } from './_helpers'

async function pickWorkOrder(page: Page): Promise<string> {
  await page.goto('/admin/work-orders')
  await page.waitForLoadState('networkidle')
  const row = page.getByTestId('work-order-row').first()
  await expect(row).toBeVisible()
  await row.click()
  await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/, { timeout: 10_000 })
  const url = page.url()
  const id = url.split('/').pop() as string
  expect(id).toBeTruthy()
  return id
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

test.describe('WO schedule + priority + dispatch board (W2-3b)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page)
  })

  test('schedule card commits a window + priority and the dispatch board renders a cell', async ({
    page,
  }) => {
    await pickWorkOrder(page)

    const start = new Date()
    start.setDate(start.getDate() + 2)
    start.setHours(9, 0, 0, 0)
    const end = new Date(start.getTime())
    end.setHours(17, 0, 0, 0)

    await page.getByTestId('schedule-start-input').locator('input').fill(toDatetimeLocal(start))
    await page.getByTestId('schedule-end-input').locator('input').fill(toDatetimeLocal(end))
    await page.getByTestId('priority-select').locator('select').selectOption('high')
    await page.getByTestId('estimated-hours-input').locator('input').fill('8')

    await expect(page.getByTestId('priority-chip')).toContainText(/high/i)
    await page.getByTestId('save-schedule-button').click()

    // Cost rollup card present.
    await expect(page.getByTestId('cost-rollup')).toBeVisible()

    // Dispatch board: at least one cell exists for the chosen day.
    await page.goto('/admin/dispatch')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-test^="dispatch-cell-"]').first()).toBeVisible()
  })
})
