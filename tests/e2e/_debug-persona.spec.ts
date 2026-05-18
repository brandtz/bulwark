import { test, expect } from '@playwright/test'

test('debug persona click', async ({ page, context }) => {
  await context.request.post('http://localhost:3000/api/services/auth/logout')
  await context.clearCookies()

  const consoleLogs: string[] = []
  page.on('console', (m) => consoleLogs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => consoleLogs.push('PAGEERR: ' + e.message))

  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push('POST ' + r.url())
  })

  await page.goto('http://localhost:3000/login?next=%2Fadmin%2Fdashboard')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  const btn = page.getByRole('button', { name: /Org admin/ })
  await expect(btn).toBeVisible()
  await btn.click()
  await page.waitForTimeout(4000)

  console.log('==URL_AFTER==' + page.url())
  console.log('==POSTS==')
  posts.forEach((p) => console.log('  ' + p))
  console.log('==CONSOLE==')
  consoleLogs.forEach((l) => console.log('  ' + l))
})
