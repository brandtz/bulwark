/**
 * Client-bundle regression for mocks imported by the /dev/ui service factory.
 * Vite must resolve browser dependencies, not Vitest's Node/SSR imports.
 * Builds stay in memory so this check does not alter application artifacts.
 * Web Crypto behavior checks preserve hashing, single use, and atomic rotation.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Secret, TOTP } from 'otpauth'
import { MockMfaService, __resetMockMfaForTests } from '../../shared/mocks/mfa.mock'
import { MockPermissionService, __resetMockPermissionsForTests } from '../../shared/mocks/permission.mock'
import { MockSavedViewService, __resetMockSavedViewsForTests } from '../../shared/mocks/saved-view.mock'

const require = createRequire(import.meta.url)
const vitestRequire = createRequire(require.resolve('vitest/package.json'))
const { build }: { build: (config: Record<string, unknown>) => Promise<unknown> } =
  await import(pathToFileURL(vitestRequire.resolve('vite')).href)

describe('mock browser imports', () => {
  it.each(['mfa.mock', 'permission.mock', 'saved-view.mock', 'factory'])(
    'bundles %s for the browser',
    async (moduleName) => {
      const result = await build({
        configFile: false,
        logLevel: 'silent',
        build: {
          write: false,
          minify: false,
          lib: {
            entry: fileURLToPath(new URL(`../../shared/mocks/${moduleName}.ts`, import.meta.url)),
            formats: ['es'],
            fileName: 'mock-browser',
          },
          rollupOptions: { output: { inlineDynamicImports: true } },
        },
      })
      expect(result).toBeDefined()
    },
    30_000,
  )
})

describe('mock Web Crypto behavior', () => {
  const organizationId = '00000000-0000-0000-0000-000000000001'
  const userId = '00000000-0000-0000-0000-00000000aaaa'
  const otherUserId = '00000000-0000-0000-0000-00000000bbbb'
  const resolver = () => ({ userId, organizationId })
  const mfa = new MockMfaService()

  beforeEach(() => {
    __resetMockMfaForTests()
    __resetMockPermissionsForTests()
    __resetMockSavedViewsForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('generates ten secure 40-bit codes with Node-compatible SHA-256 hashes', async () => {
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues')
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest')
    const { codes } = await mfa.generateBackupCodes(userId)

    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    expect(random).toHaveBeenCalledTimes(10)
    expect(digest).toHaveBeenCalledTimes(10)
    for (const [index, code] of codes.entries()) {
      expect(code).toMatch(/^[0-9a-f]{10}$/)
      expect(random.mock.calls[index]![0]?.byteLength).toBe(5)
      expect(digest.mock.calls[index]![0]).toBe('SHA-256')
      expect(digest.mock.calls[index]![1]).toEqual(new TextEncoder().encode(code))
      const actual = Buffer.from(await digest.mock.results[index]!.value).toString('hex')
      expect(actual).toBe(createHash('sha256').update(code).digest('hex'))
    }
  })

  it('trims codes, rejects wrong users and invalid codes, and prevents concurrent replay', async () => {
    const { codes } = await mfa.generateBackupCodes(userId)
    expect(await mfa.consumeBackupCode(otherUserId, codes[0]!)).toEqual({ ok: false, remaining: 0 })
    expect(await mfa.consumeBackupCode(userId, 'invalid')).toEqual({ ok: false, remaining: 10 })
    const attempts = await Promise.all([
      mfa.consumeBackupCode(userId, ` ${codes[0]}\n`),
      mfa.consumeBackupCode(userId, codes[0]!),
    ])
    expect(attempts.filter((attempt) => attempt.ok)).toHaveLength(1)
    expect(attempts.every((attempt) => attempt.remaining === 9)).toBe(true)
    expect(await mfa.consumeBackupCode(userId, codes[0]!)).toEqual({ ok: false, remaining: 9 })
  })

  it('invalidates the previous batch without replacing another user\'s codes', async () => {
    const previous = await mfa.generateBackupCodes(userId)
    const other = await mfa.generateBackupCodes(otherUserId)
    const replacement = await mfa.generateBackupCodes(userId)
    expect(await mfa.consumeBackupCode(userId, previous.codes[0]!)).toEqual({ ok: false, remaining: 10 })
    expect(await mfa.consumeBackupCode(userId, replacement.codes[0]!)).toEqual({ ok: true, remaining: 9 })
    expect(await mfa.consumeBackupCode(otherUserId, other.codes[0]!)).toEqual({ ok: true, remaining: 9 })
  })

  it('publishes only one complete batch when generation overlaps', async () => {
    const batches = await Promise.all([
      mfa.generateBackupCodes(userId),
      mfa.generateBackupCodes(userId),
    ])
    expect((await mfa.getStatus(userId)).backupCodesRemaining).toBe(10)
    const accepted = await Promise.all(batches.map(async ({ codes }) => {
      const attempts = await Promise.all(codes.map((code) => mfa.consumeBackupCode(userId, code)))
      return attempts.filter((attempt) => attempt.ok).length
    }))
    expect(accepted.sort((left, right) => left - right)).toEqual([0, 10])
  })

  it('keeps the previous batch intact if hashing a replacement fails', async () => {
    const previous = await mfa.generateBackupCodes(userId)
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest')
      .mockRejectedValueOnce(new Error('digest unavailable'))
    await expect(mfa.generateBackupCodes(userId)).rejects.toThrow('digest unavailable')
    digest.mockRestore()
    expect((await mfa.getStatus(userId)).backupCodesRemaining).toBe(10)
    expect(await mfa.consumeBackupCode(userId, previous.codes[0]!)).toEqual({ ok: true, remaining: 9 })
  })

  it('preserves TOTP enrollment and backup-code disable fallback', async () => {
    const setup = await mfa.setupTotp(userId)
    expect(setup.otpauthUrl).toContain('otpauth://totp/')
    expect((await mfa.getStatus(userId)).enabled).toBe(false)
    const token = new TOTP({ secret: Secret.fromBase32(setup.secret) }).generate()
    expect(await mfa.verifyTotp(userId, token)).toEqual({ ok: false })
    expect(await mfa.confirmTotp(userId, token)).toEqual({ confirmed: true })
    expect(await mfa.verifyTotp(userId, token)).toEqual({ ok: true })
    const { codes } = await mfa.generateBackupCodes(userId)
    expect(await mfa.disable(userId, 'invalid')).toEqual({ disabled: false })
    expect(await mfa.disable(userId, codes[0]!)).toEqual({ disabled: true })
    expect(await mfa.getStatus(userId)).toEqual({ enabled: false, backupCodesRemaining: 0 })
    expect(await mfa.consumeBackupCode(userId, codes[1]!)).toEqual({ ok: false, remaining: 0 })
  })

  it('uses secure UUIDs for permission and saved-view records and rejects cross-tenant writes', async () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')
    const permissions = new MockPermissionService(resolver)
    const views = new MockSavedViewService(resolver)
    const permissionInput = { organizationId, role: 'field' as const, permissionSlug: 'properties.read', allowed: true }
    const viewInput = { organizationId, userId, entityType: 'property' as const, name: 'My view', filters: {} }
    const permission = await permissions.upsert(permissionInput)
    const view = await views.create(viewInput)
    expect(randomUUID).toHaveBeenCalledTimes(2)
    for (const id of [permission.id, view.id]) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
    expect(permission.id).not.toBe(view.id)
    expect((await permissions.upsert({ ...permissionInput, allowed: false })).id).toBe(permission.id)
    await expect(permissions.upsert({ ...permissionInput, organizationId: otherUserId })).rejects.toThrow()
    await expect(views.create({ ...viewInput, organizationId: otherUserId })).rejects.toThrow()
    expect(randomUUID).toHaveBeenCalledTimes(2)
  })
})