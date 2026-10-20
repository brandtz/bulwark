/**
 * SH-11 — Privacy Policy.
 * Source design: agents/design/return/design-return/A/screens/SH-11-privacy-policy/SPEC.md
 */
import { test, expect } from '@playwright/test'
import { describeScreen } from './_contract'

const route = '/privacy'

describeScreen({
  id: 'SH-11',
  route,
  roles: [],
  publicRoute: true,
  viewports: ['desktop', 'mobile'],
  testIds: ['legal-document', 'legal-toc', 'legal-owner-badge', 'legal-effective-date', 'legal-changelog'],
}, () => {
  test.describe('states (from SPEC)', () => {
    test('state: Default — published privacy document has its date, owner, contents and changelog', async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible()
      await expect(page.getByTestId('legal-owner-badge')).toHaveText('Platform policy')
      await expect(page.getByTestId('legal-effective-date')).toHaveText('Effective 2026-05-16')
      await expect(page.getByTestId('legal-toc')).toBeVisible()
      await expect(page.getByTestId('legal-changelog')).toContainText('Initial platform privacy policy published.')
      await expect(page.getByRole('heading', { name: '1. Data we collect', level: 2 })).toBeVisible()
      await expect(page.getByText(/Draft — not yet effective/)).not.toBeVisible()
    })

    test('state: Loading — skeleton title and six paragraph placeholders appear during fetch', async ({ page }) => {
      await page.goto(route, { waitUntil: 'commit' })
      await expect(page.locator('main [aria-busy="true"]')).toBeVisible()
      await expect(page.locator('main [role="status"]')).toHaveText('Loading')
      await expect(page.locator('main .bw-skel')).toHaveCount(7)
    })

    test('state: Draft (admin preview) — preview warns that the policy is not yet effective', async ({ page }) => {
      await page.goto(`${route}?preview=draft`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('Draft — not yet effective', { exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible()
    })
  })

  test.describe('actions (from SPEC)', () => {
    test('action: TOC link — updates the hash and lands on the selected section', async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('legal-toc').getByRole('link', { name: /1\. Data we collect/ }).click()
      await expect(page).toHaveURL(/#sec-1$/)
      await expect(page.locator('#sec-1')).toBeVisible()
    })

    test('action: Switch document — Privacy navigation opens the Terms page', async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.getByRole('navigation', { name: 'Legal documents' }).getByRole('link', { name: 'Terms' }).click()
      await expect(page).toHaveURL(/\/terms$/)
      await expect(page.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible()
    })

    test('action: Print — table of contents is omitted in print media', async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.emulateMedia({ media: 'print' })
      await expect(page.getByTestId('legal-toc')).toBeHidden()
      await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible()
    })
  })
})
