/** WP-L07 S4 — production configuration guard (server/utils/env-guard.ts). */
import { describe, expect, it } from 'vitest'
import { assertProductionEnv, evaluateProductionEnv } from '../../server/utils/env-guard'

const strong = 'x'.repeat(40)
const safe = {
  NODE_ENV: 'production',
  NUXT_SESSION_PASSWORD: strong,
  JWT_SECRET: `${strong}-jwt`,
  DATABASE_URL: 'postgres://u:p@ep-cool-name.us-west-2.aws.neon.tech/bulwark?sslmode=require',
  BULWARK_APP_URL: 'https://bulwark.example',
  R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c', R2_BUCKET: 'd',
}

describe('evaluateProductionEnv', () => {
  it('is clean for a safe production environment and silent outside production', () => {
    expect(evaluateProductionEnv(safe)).toEqual({ critical: [], warnings: [] })
    expect(evaluateProductionEnv({ NODE_ENV: 'development', BULWARK_BACKEND: 'mock' })).toEqual({ critical: [], warnings: [] })
  })

  it.each([
    [{ BULWARK_BACKEND: 'mock' }, /mock data/u],
    [{ BULWARK_PDF_STUB: '1' }, /placeholder PDFs/u],
    [{ BULWARK_STORAGE_DRIVER: 'fs' }, /local filesystem/u],
    [{ BULWARK_RATE_LIMIT_DISABLED: '1' }, /login throttling/u],
    [{ NUXT_SESSION_PASSWORD: undefined }, /forgeable/u],
    [{ NUXT_SESSION_PASSWORD: 'short' }, /forgeable/u],
    [{ NUXT_SESSION_PASSWORD: 'dev-only-32char-min-replace-in-env' }, /forgeable/u],
    [{ JWT_SECRET: 'short' }, /JWT_SECRET/u],
    [{ DATABASE_URL: undefined }, /DATABASE_URL is not set/u],
    [{ DATABASE_URL: 'postgresql://u:p@localhost:5432/bulwark_dev' }, /local database/u],
    [{ DATABASE_URL: 'postgresql://u:p@127.0.0.1/bulwark' }, /local database/u],
  ])('flags %o as critical', (override, message) => {
    const report = evaluateProductionEnv({ ...safe, ...override })
    expect(report.critical.join('\n')).toMatch(message)
  })

  it('treats degraded features as warnings, not critical', () => {
    const report = evaluateProductionEnv({ ...safe, JWT_SECRET: undefined, BULWARK_APP_URL: 'http://bulwark.example', BULWARK_NOTIFICATIONS_DISABLED: '1', R2_BUCKET: undefined })
    expect(report.critical).toEqual([])
    expect(report.warnings).toHaveLength(4)
  })
})

describe('assertProductionEnv', () => {
  const unsafe = { ...safe, BULWARK_PDF_STUB: '1' }

  it('throws on critical findings only when enforcement is on', () => {
    expect(() => assertProductionEnv(unsafe)).not.toThrow()
    expect(() => assertProductionEnv({ ...unsafe, BULWARK_ENV_GUARD: 'enforce' })).toThrow(/placeholder PDFs/u)
    expect(() => assertProductionEnv({ ...safe, BULWARK_ENV_GUARD: 'enforce' })).not.toThrow()
  })
})
