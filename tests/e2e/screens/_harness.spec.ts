import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { signIn } from '../_helpers'
import { assertAxeClean, PERSONAS } from './_contract'
import { BASELINE_DIR, expectVisualParity } from './_visual'

const root = process.cwd()

test('scaffold output keeps unfinished states as fixmes', () => {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), 'bulwark-screen-scaffold-'))
  try {
    const script = path.join(root, 'scripts', 'codegraph', 'scaffold-screen-test.mjs')
    const result = spawnSync(process.execPath, [script, 'SH-01', `--out-dir=${outputDir}`], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    const generated = readFileSync(path.join(outputDir, 'SH-01.spec.ts'), 'utf8')
    expect(generated).toContain('test.fixme(')
    expect(generated).not.toContain('test.skip(')
    expect(generated).toContain('publicRoute: true')
    const audit = spawnSync(process.execPath, [
      path.join(root, 'scripts', 'codegraph', 'screen-audit.mjs'),
      `--spec-file=${path.join(outputDir, 'SH-01.spec.ts')}`,
    ], { encoding: 'utf8' })
    expect(audit.status).toBe(1)
    expect(audit.stdout).toContain('test.fixme/skip remaining')
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

test('SH-01 design baseline matches itself and rejects blank output', async ({ page }) => {
  const baseline = path.join(BASELINE_DIR, 'SH-01-desktop.png')
  expect(existsSync(baseline)).toBe(true)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`file:///${baseline.replace(/\\/g, '/')}`)
  await page.evaluate(() => {
    document.body.style.margin = '0'
    const image = document.querySelector('img')
    if (image) {
      image.style.width = '100vw'
      image.style.height = '100vh'
      image.style.objectFit = 'fill'
    }
  })
  await expectVisualParity(page, { id: 'SH-01', variant: 'desktop' })

  await page.goto('about:blank')
  let rejected = false
  try {
    await expectVisualParity(page, { id: 'SH-01', variant: 'desktop' })
  } catch {
    rejected = true
  }
  expect(rejected).toBe(true)
})

test('axe helper rejects the known low-contrast fixture', async ({ page }) => {
  await page.goto('/dev/axe-contrast-fixture')
  await expect(page.getByText('Known low-contrast fixture text')).toBeVisible()
  let violationsFound = false
  try {
    await assertAxeClean(page)
  } catch (error) {
    violationsFound = String(error).includes('color-contrast')
  }
  expect(violationsFound).toBe(true)
})

test('persona helper authenticates all eight roles and enforces admin API 403s', async ({ browser }) => {
  test.skip(process.env.BULWARK_BACKEND !== 'real', 'persona authorization requires the real backend')
  test.setTimeout(180_000)
  expect(Object.keys(PERSONAS)).toHaveLength(8)

  for (const [role, email] of Object.entries(PERSONAS)) {
    const context = await browser.newContext()
    try {
      await signIn(context, email)
      const response = await context.request.get('http://localhost:3000/api/metrics')
      const allowed = role === 'org_admin' || role === 'super_admin'
      expect(response.status(), `${role} access to /api/metrics`).toBe(allowed ? 200 : 403)
    } finally {
      await context.close()
    }
  }
})