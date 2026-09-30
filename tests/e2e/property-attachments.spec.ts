/**
 * tests/e2e/property-attachments.spec.ts — property attachments on the storage
 * service (WP-L02 S2).
 *
 * A PDF goes presign → PUT → finalize and is listed with a working signed
 * download; a type the attachment policy refuses (GIF) shows an upload error
 * and adds no row. Real backend only: needs the storage driver (moto in CI).
 */
import { expect, test } from '@playwright/test'
import { signInAsAdmin, waitForHydration } from './_helpers'

const BASE = 'http://localhost:3000'
// Smallest valid-looking PDF; the policy checks the declared type and size.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
const GIF = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')

test.describe('property attachments (WP-L02)', () => {
  test.skip(process.env.BULWARK_BACKEND !== 'real', 'uploads go through the real storage driver')
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop admin flow')

  test('a PDF uploads, lists and downloads; a GIF is refused with an error', async ({ page }) => {
    await signInAsAdmin(page)
    const me = await (await page.request.post(`${BASE}/api/services/auth/currentUser`, { data: { args: [] } })).json()
    const organizationId = me.activeOrganizationId as string
    const created = await page.request.post(`${BASE}/api/services/property/create`, {
      data: { args: [{ organizationId, addressLine1: `${Date.now() % 100000} Attachment Way`, city: 'Napa', state: 'CA', postalCode: '94558' }] },
    })
    expect(created.status()).toBe(200)
    const propertyId = (await created.json()).id as string

    await page.goto(`/admin/properties/${propertyId}/attachments`)
    await waitForHydration(page)
    await expect(page.getByTestId('property-attachments-page')).toBeVisible()
    await expect(page.getByTestId('attachments-empty-state')).toBeVisible()

    const name = `scope-${Date.now()}.pdf`
    await page.getByTestId('attachment-upload-input').setInputFiles({ name, mimeType: 'application/pdf', buffer: PDF })
    const row = page.getByTestId('attachment-row').filter({ hasText: name })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('attachment-upload-error')).toHaveCount(0)

    // The download link is a signed URL to the stored object, not a data: URL.
    const href = await row.getByTestId('attachment-download').getAttribute('href')
    expect(href).toBeTruthy()
    expect(href!.startsWith('data:')).toBe(false)
    const res = await page.request.get(new URL(href!, BASE).toString())
    expect(res.status()).toBe(200)
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-')

    await page.getByTestId('attachment-upload-input').setInputFiles({ name: 'pixel.gif', mimeType: 'image/gif', buffer: GIF })
    await expect(page.getByTestId('attachment-upload-error')).toBeVisible()
    await expect(page.getByTestId('attachment-row')).toHaveCount(1)
  })
})
