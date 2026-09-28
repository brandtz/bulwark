/**
 * tests/e2e/field-tabs.spec.ts — WP-L08 (epic L09-S1) field tab routing.
 *
 * The field tab strip used to send Inspect, Photos and Notes all to
 * /field/check-in. Now: My Day + Check in everywhere; Inspect + Photos only in
 * a job, linking to that job's pages; each tab a distinct destination; the
 * active one marked aria-current="page".
 */
import { expect, test, type Page } from '@playwright/test'
import { signInAsAdmin, signInAsField, signOut, waitForHydration } from './_helpers'

async function hrefs(page: Page): Promise<string[]> {
  return await page.getByTestId('field-tabs').locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))
}

test.describe('field tabs (L09-S1)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('tabs route to distinct real pages and mark the active one', async ({ page, context }) => {
    test.skip(process.env.BULWARK_BACKEND === 'mock', 'the job pages read /api/field/* from the real server')
    // Harvest a work order id as admin (seed-agnostic, same as field-photo-capture).
    await signInAsAdmin(page)
    await page.goto('/admin/work-orders')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('work-order-row').first().click()
    await page.waitForURL(/\/admin\/work-orders\/[\w-]+$/u)
    const woId = page.url().split('/').pop()!
    await signOut(context)

    await signInAsField(page)
    await page.goto('/field')
    await waitForHydration(page)
    // Outside a job: only My Day + Check in, My Day current.
    expect(await hrefs(page)).toEqual(['/field', '/field/check-in'])
    await expect(page.getByTestId('field-tab-my-day')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('field-tab-check-in')).not.toHaveAttribute('aria-current', 'page')

    // Inside a job: Inspect + Photos point at THIS job.
    await page.goto(`/field/jobs/${woId}`)
    await waitForHydration(page)
    const inJob = await hrefs(page)
    expect(inJob).toEqual(['/field', `/field/jobs/${woId}/inspect`, `/field/jobs/${woId}/photos`, '/field/check-in'])
    expect(new Set(inJob).size).toBe(inJob.length)

    await page.getByTestId('field-tab-photos').click()
    await page.waitForURL(new RegExp(`/field/jobs/${woId}/photos$`, 'u'))
    await expect(page.getByTestId('field-photos')).toBeVisible()
    await expect(page.getByTestId('field-tab-photos')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('field-tab-my-day')).not.toHaveAttribute('aria-current', 'page')

    await page.getByTestId('field-tab-check-in').click()
    await page.waitForURL(/\/field\/check-in$/u)
    await expect(page.getByTestId('field-tab-check-in')).toHaveAttribute('aria-current', 'page')
  })
})
