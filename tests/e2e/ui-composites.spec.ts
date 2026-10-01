/**
 * tests/e2e/ui-composites.spec.ts — WP-A3 composites on /dev/ui.
 *
 * DataTable: keyboard sorting with aria-sort, roving row focus, header select
 * takes the loaded page only and "Select all N" is explicit, card list at 390.
 * FilterBar: filters land in the URL, survive a reload, Clear all removes them.
 * StatusMenu: only legal transitions are enabled (others disabled with the
 * reason); backwards moves confirm; a reason is required where configured.
 * KanbanBoard: keyboard move (Space, arrows, Enter); illegal moves are refused
 * and announced, legal moves land and are announced.
 */
import { test, expect, type Page } from '@playwright/test'
import { waitForHydration } from './_helpers'

async function gotoUi(page: Page, query = '') {
  await page.goto(`/dev/ui${query}`)
  await waitForHydration(page)
  await expect(page.getByTestId('ui-BulwarkDataTable')).toBeVisible()
}

test.describe('UI composites (WP-A3)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop keyboard checks')

  test('data table: keyboard sort sets aria-sort and orders rows; arrows move row focus', async ({ page }) => {
    await gotoUi(page)
    const section = page.getByTestId('ui-BulwarkDataTable')
    const quoteHeader = section.locator('th', { hasText: 'Quote' })
    await quoteHeader.getByRole('button').focus()
    await page.keyboard.press('Enter')
    await expect(quoteHeader).toHaveAttribute('aria-sort', 'ascending')
    await page.keyboard.press('Enter')
    await expect(quoteHeader).toHaveAttribute('aria-sort', 'descending')
    const firstQuote = section.getByTestId('datatable-row').first().locator('td.num')
    await expect(firstQuote).toHaveText('$15,000')
    // Empty quotes stay last in both directions.
    await expect(section.getByTestId('datatable-row').last().locator('td.num')).toHaveText('—')

    const rows = section.getByTestId('datatable-row')
    await rows.first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(rows.nth(1)).toBeFocused()
    await page.keyboard.press('End')
    await expect(rows.last()).toBeFocused()
  })

  test('data table: the header box selects the loaded page; "Select all 214" is a separate step', async ({ page }) => {
    await gotoUi(page)
    const section = page.getByTestId('ui-BulwarkDataTable')
    await section.getByTestId('datatable-select-page').check()
    const bar = section.getByTestId('datatable-bulk-bar')
    await expect(bar).toContainText('12 selected')
    await bar.getByTestId('datatable-select-all-matching').click()
    await expect(bar).toContainText('214 selected')
    await bar.getByRole('button', { name: 'Change status' }).click()
    await expect(page.getByTestId('bulk-last')).toHaveText('status: all 214')
    // Unticking one row leaves the all-matching mode.
    await section.getByRole('checkbox', { name: /^Select 1800 Rimrock Rd$/u }).uncheck()
    await expect(bar).toContainText('11 selected')
  })

  test('data table: below 768px the rows are a card list, not a table', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoUi(page)
    const section = page.getByTestId('ui-BulwarkDataTable')
    await expect(section.locator('table.bw-table')).toBeHidden()
    await expect(section.getByTestId('datatable-card')).toHaveCount(12)
    await expect(section.getByTestId('datatable-card').first()).toContainText('1800 Rimrock Rd')
  })

  test('filter bar: filters go to the URL, survive a reload, and Clear all removes them', async ({ page }) => {
    await gotoUi(page)
    await page.getByTestId('filter-chip-status').click()
    await page.getByRole('group', { name: 'Status' }).getByLabel('Lead').check()
    await expect(page).toHaveURL(/[?&]status=lead/u)
    await expect(page.getByTestId('filtered-count')).toHaveText('3 match the filters')
    await expect(page.getByTestId('filter-summary')).toContainText('Showing 3 of 12')

    await page.reload()
    await waitForHydration(page)
    await expect(page.getByTestId('filter-chip-status')).toContainText('1')
    await expect(page.getByTestId('filtered-count')).toHaveText('3 match the filters')

    await page.getByTestId('filter-clear').click()
    await expect(page).not.toHaveURL(/status=/u)
    await expect(page.getByTestId('filtered-count')).toHaveText('12 match the filters')
  })

  test('filter bar: a malformed query is ignored, not an error', async ({ page }) => {
    await gotoUi(page, '?status=bogus&owner=me&owner=anyone')
    await expect(page.getByTestId('filtered-count')).toHaveText('12 match the filters')
    await expect(page.getByTestId('filter-chip-owner')).toContainText('1')
  })

  test('status menu: legal moves only; backwards confirms; a required reason is enforced', async ({ page }) => {
    await gotoUi(page)
    const section = page.getByTestId('ui-BulwarkStatusMenu')
    await section.getByTestId('status-menu-button').click()
    const menu = section.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: /Quoted/ })).not.toHaveAttribute('aria-disabled', 'true')
    const illegal = menu.getByRole('menuitem', { name: /In progress/ })
    await expect(illegal).toHaveAttribute('aria-disabled', 'true')
    await expect(illegal).toContainText('Not allowed from Scheduled')
    await illegal.click({ force: true })
    await expect(page.getByTestId('status-last')).toHaveText('No change yet')

    // Backwards (Scheduled → Lead) asks first.
    await menu.getByRole('menuitem', { name: /Lead/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Change status to Lead?' })
    await expect(dialog).toContainText('moves the record back')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('status-last')).toHaveText('No change yet')

    // On hold requires a reason.
    await section.getByTestId('status-menu-button').click()
    await section.getByRole('menu').getByRole('menuitem', { name: /On hold/ }).click()
    const hold = page.getByRole('dialog', { name: 'Change status to On hold?' })
    await hold.getByTestId('status-confirm').click()
    await expect(hold.getByRole('alert')).toContainText('Give a reason')
    await hold.getByTestId('status-reason').locator('textarea').fill('Waiting on permit')
    await hold.getByTestId('status-confirm').click()
    await expect(page.getByTestId('status-last')).toHaveText('on_hold (Waiting on permit)')
  })

  test('kanban: keyboard moves; illegal ones are refused and announced', async ({ page }) => {
    await gotoUi(page)
    const live = page.getByTestId('kanban-live')
    const leadCard = page.locator('[data-testid="kanban-column"][data-column="lead"] [data-testid="kanban-card"]').first()
    const cardId = await leadCard.getAttribute('data-card')
    // Lead → In progress is not legal.
    await leadCard.focus()
    await page.keyboard.press('Space')
    await expect(live).toContainText('Picked up')
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(live).toContainText("Can't move")
    await expect(page.locator(`[data-testid="kanban-column"][data-column="lead"] [data-card="${cardId}"]`)).toHaveCount(1)
    // Lead → Scheduled is legal.
    await page.locator(`[data-card="${cardId}"]`).focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(live).toContainText('Moved')
    await expect(page.locator(`[data-testid="kanban-column"][data-column="scheduled"] [data-card="${cardId}"]`)).toHaveCount(1)
  })
})
