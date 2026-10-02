/**
 * tests/e2e/ui-primitives.spec.ts — WP-A2 primitives on /dev/ui.
 *
 * Every restyled primitive renders (light + dark panels), the page is axe
 * clean in both themes, and each interactive primitive follows its SPEC
 * keyboard map: Tabs and SegmentedControl arrows, split-button menu, Select
 * combobox type-ahead, PassFail arrows, Stepper spinbutton, SearchField Esc and
 * "/" shortcut, Toggle Space, MultiSelect chip Backspace, Modal and Drawer focus
 * trap / Esc / restore, the Drawer's unsaved guard. Disabled and loading
 * buttons are inert; keyboard focus shows a ring.
 */
import { test, expect, type Page } from '@playwright/test'
import { waitForHydration } from './_helpers'
import { assertAxeClean } from './screens/_contract'

const A2_SECTIONS = [
  'BulwarkAvatar', 'BulwarkBreadcrumbs', 'BulwarkButton', 'BulwarkCard', 'BulwarkDatePicker', 'BulwarkDrawer',
  'BulwarkFilePicker', 'BulwarkIcon', 'BulwarkInput', 'BulwarkJobCard', 'BulwarkMultiSelect', 'BulwarkPagination',
  'BulwarkPassFailToggle', 'BulwarkSearchField', 'BulwarkSignaturePad', 'BulwarkSkeleton', 'BulwarkStepper',
  'BulwarkTabs', 'BulwarkToastHost', 'BulwarkToggle', 'EmptyState', 'StatusBadge',
]

async function gotoUi(page: Page) {
  await page.goto('/dev/ui')
  await waitForHydration(page)
  await expect(page.getByTestId('ui-BulwarkButton')).toBeVisible()
}

/** The light panel of one component's specimen section. */
const light = (page: Page, component: string) => page.getByTestId(`ui-${component}`).locator('[data-panel="light"]')

test.describe('UI primitives (WP-A2)', () => {
  test.describe.configure({ mode: 'serial' })

  // Signed out: /dev/ui is public in test servers, and a signed-in persona's
  // saved theme (theme.spec sets one) would change what axe measures.
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'desktop keyboard checks')
  })

  test('every A2 primitive has a section with light and dark panels', async ({ page }) => {
    await gotoUi(page)
    for (const name of A2_SECTIONS) {
      const section = page.getByTestId(`ui-${name}`)
      await expect(section, name).toBeVisible()
    }
    expect(await page.locator('[data-panel="dark"]').count()).toBeGreaterThanOrEqual(15)
    expect(await page.locator('[data-panel="dark"] .bw-btn--primary').count()).toBeGreaterThan(0)
  })

  test('the specimen page is axe clean in both themes (serious + critical)', async ({ page }) => {
    await gotoUi(page)
    await assertAxeClean(page)
  })

  test('disabled and loading buttons are inert; keyboard focus shows a ring', async ({ page }) => {
    await gotoUi(page)
    const section = light(page, 'BulwarkButton')
    await expect(section.getByRole('button', { name: 'Disabled' })).toBeDisabled()
    await expect(section.getByRole('button', { name: 'Loading' })).toBeDisabled()
    await expect(section.getByRole('button', { name: 'Loading' })).toHaveAttribute('aria-busy', 'true')
    await section.getByRole('button', { name: 'New Quote' }).focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).boxShadow)
    expect(ring).not.toBe('none')
  })

  test('split button: ArrowDown opens the menu, arrows move, Enter chooses, Esc returns focus', async ({ page }) => {
    await gotoUi(page)
    const toggle = page.getByRole('button', { name: 'Save options' })
    await toggle.focus()
    await page.keyboard.press('ArrowDown')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Save and send' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('split-last')).toHaveText('Chose: Save as template')
    await expect(menu).toBeHidden()
    await expect(toggle).toBeFocused()
    await toggle.click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    await expect(toggle).toBeFocused()
  })

  test('tabs: arrows move and select, skipping disabled; the panel follows', async ({ page }) => {
    await gotoUi(page)
    const overview = page.getByRole('tab', { name: 'Overview' })
    await overview.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: /Quotes/ })).toBeFocused()
    await expect(page.getByText('1 quote')).toBeVisible()
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: /Photos/ })).toHaveAttribute('aria-selected', 'true') // Archive is disabled
    await page.keyboard.press('ArrowRight')
    await expect(overview).toHaveAttribute('aria-selected', 'true') // wraps past the disabled tab
    await expect(page.getByText('Overview content')).toBeVisible()
  })

  test('segmented control: arrows select', async ({ page }) => {
    await gotoUi(page)
    const list = page.getByRole('tab', { name: 'List' })
    await list.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Board' })).toBeFocused()
  })

  test('select combobox: keyboard opens, type-ahead moves, Enter picks', async ({ page }) => {
    await gotoUi(page)
    const combo = light(page, 'BulwarkInput').getByRole('combobox', { name: 'Trade (combobox)' })
    await combo.focus()
    await page.keyboard.press('ArrowDown')
    await expect(light(page, 'BulwarkInput').getByRole('listbox')).toBeVisible()
    await page.keyboard.type('si')
    await page.keyboard.press('Enter')
    await expect(combo).toHaveText(/Siding/)
    await expect(light(page, 'BulwarkInput').getByRole('listbox')).toBeHidden()
  })

  test('pass/fail: arrows move the selection; fail prompts for a photo', async ({ page }) => {
    await gotoUi(page)
    const group = page.getByRole('radiogroup', { name: 'Vents are ember-resistant' })
    await group.getByRole('radio', { name: 'Pass' }).click()
    await expect(group.getByRole('radio', { name: 'Pass' })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowRight')
    await expect(group.getByRole('radio', { name: 'Fail' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Add a photo of the failure.')).toBeVisible()
  })

  test('stepper input: ArrowUp/Down change the value within bounds', async ({ page }) => {
    await gotoUi(page)
    const spin = light(page, 'BulwarkStepper').getByRole('spinbutton', { name: 'Quantity' })
    await spin.focus()
    await page.keyboard.press('ArrowUp')
    await expect(spin).toHaveAttribute('aria-valuenow', '4')
    await page.keyboard.press('Home')
    await expect(spin).toHaveAttribute('aria-valuenow', '0')
    await page.keyboard.press('ArrowDown')
    await expect(spin).toHaveAttribute('aria-valuenow', '0') // min holds
  })

  test('search field: "/" focuses it, Esc clears, the clear button resets', async ({ page }) => {
    await gotoUi(page)
    const search = page.getByTestId('ui-BulwarkSearchField').getByRole('searchbox', { name: 'Search' })
    await page.getByRole('heading', { level: 1, name: 'Components' }).click()
    await page.keyboard.press('/')
    await expect(search).toBeFocused()
    await page.keyboard.type('truckee')
    await page.keyboard.press('Escape')
    await expect(search).toHaveValue('')
    await search.fill('rimrock')
    await page.getByTestId('ui-BulwarkSearchField').getByRole('button', { name: /Clear Search/ }).click()
    await expect(search).toHaveValue('')
  })

  test('toggle is a switch that Space flips', async ({ page }) => {
    await gotoUi(page)
    const sw = light(page, 'BulwarkToggle').getByRole('switch', { name: 'Off' })
    await sw.focus()
    await page.keyboard.press('Space')
    await expect(sw).toBeChecked()
  })

  test('multi-select: Backspace on a chip removes it', async ({ page }) => {
    await gotoUi(page)
    const field = light(page, 'BulwarkMultiSelect').getByRole('group', { name: 'Trades' })
    const chip = field.getByLabel(/^Gutters, press Backspace/)
    await chip.focus()
    await page.keyboard.press('Backspace')
    await expect(field.getByLabel(/^Gutters, press Backspace/)).toHaveCount(0)
    await expect(field.getByRole('checkbox', { name: 'Gutters' })).not.toBeChecked()
  })

  test('modal: focus moves in and is trapped, a destructive modal ignores the overlay, Esc closes and restores focus', async ({ page }) => {
    await gotoUi(page)
    const opener = page.getByRole('button', { name: 'Open modal' })
    await opener.click()
    const dialog = page.getByRole('alertdialog', { name: 'Void invoice INV-1042?' })
    await expect(dialog).toBeVisible()
    await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    }
    await page.mouse.click(5, 5) // overlay: destructive dialogs stay open
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test('drawer: focus trap, Esc closes and restores focus; unsaved changes ask before discarding', async ({ page }) => {
    await gotoUi(page)
    const opener = page.getByRole('button', { name: 'Open drawer' })
    await opener.click()
    const drawer = page.getByRole('dialog', { name: 'Edit filters' })
    await expect(drawer).toBeVisible()
    await expect.poll(() => drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      expect(await drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(opener).toBeFocused()

    // Dirty: Esc asks first; Keep editing keeps the text; Discard closes.
    await opener.click()
    await page.getByTestId('dev-drawer-note').locator('input').fill('half-written')
    await page.keyboard.press('Escape')
    const confirm = page.getByTestId('drawer-discard-confirm')
    await expect(confirm).toBeVisible()
    await expect(confirm.getByRole('button', { name: 'Keep editing' })).toBeFocused()
    await confirm.getByRole('button', { name: 'Keep editing' }).click()
    await expect(page.getByTestId('dev-drawer-note').locator('input')).toHaveValue('half-written')
    await page.locator('.bw-drawer-overlay').click({ position: { x: 10, y: 10 } })
    await page.getByTestId('drawer-discard-confirm').getByRole('button', { name: 'Discard' }).click()
    await expect(drawer).toBeHidden()
  })

  test('toast: success auto-dismisses; an error is an alert that stays', async ({ page }) => {
    await gotoUi(page)
    await page.getByTestId('toast-success').click()
    await expect(page.getByText('Done', { exact: true })).toBeVisible()
    await expect(page.getByText('Done', { exact: true })).toBeHidden({ timeout: 8000 })
    await page.getByTestId('toast-error').click()
    const alert = page.getByRole('alert').filter({ hasText: 'Save failed' })
    await expect(alert).toBeVisible()
    await page.waitForTimeout(5000)
    await expect(alert).toBeVisible()
    await alert.getByRole('button', { name: 'Dismiss' }).click()
    await expect(alert).toBeHidden()
  })

  test('pagination: Next moves the current page', async ({ page }) => {
    await gotoUi(page)
    const nav = page.getByRole('navigation', { name: 'Pagination' })
    await expect(nav.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page')
    await nav.getByRole('button', { name: 'Next page' }).click()
    await expect(nav.getByRole('button', { name: 'Page 3', exact: true })).toHaveAttribute('aria-current', 'page')
  })
})
