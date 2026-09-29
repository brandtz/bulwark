/**
 * tests/unit/storage-presign.test.ts — L01-S2 presign authorization policy.
 *
 * Drives every branch of the pure presign policy (the security core). The thin
 * h3 handlers wrap these + the standard session check; the full HTTP round-trip
 * is covered by tests/e2e/storage-presign.spec.ts.
 */
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  authorizePresignUpload,
  authorizePresignDownload,
  authorizeFinalize,
  roleMayUpload,
} from '~~/server/services/storage/presign-policy'
import { buildStagingKey, buildStorageKey, isStagingKey, stagingKeyBelongsTo } from '~~/server/services/storage/keys'
import { assertOwnedAssetKey, isStorageKey } from '~~/server/services/storage/asset-urls'

const ORG = randomUUID()
const USER = randomUUID()

describe('authorizePresignUpload', () => {
  it('mints a key under the active org on a valid request', () => {
    const r = authorizePresignUpload(ORG, {
      organizationId: ORG,
      entity: 'property_photo',
      entityId: randomUUID(),
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    }, USER)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.key.startsWith(`${ORG}/property_photo/`)).toBe(true)
      expect(isStagingKey(r.key)).toBe(true)
      expect(stagingKeyBelongsTo(r.key, USER)).toBe(true)
      expect(isStorageKey(r.key)).toBe(true)
    }
  })

  it('403s when the requested org is not the active org', () => {
    const r = authorizePresignUpload(ORG, {
      organizationId: randomUUID(),
      entity: 'property_photo',
      entityId: randomUUID(),
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    }, USER)
    expect(r).toEqual({ ok: false, status: 403, message: 'Organization mismatch' })
  })

  it('400s on a disallowed MIME for the entity', () => {
    const r = authorizePresignUpload(ORG, {
      organizationId: ORG,
      entity: 'document',
      entityId: randomUUID(),
      contentType: 'image/png',
      sizeBytes: 1024,
    }, USER)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('400s on an oversize upload', () => {
    const r = authorizePresignUpload(ORG, {
      organizationId: ORG,
      entity: 'avatar',
      entityId: randomUUID(),
      contentType: 'image/png',
      sizeBytes: 50 * 1024 * 1024,
    }, USER)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })
})

describe('authorizePresignDownload', () => {
  it('allows a key whose tenant prefix matches the active org', () => {
    const key = buildStorageKey({ tenantId: ORG, entity: 'document', entityId: randomUUID(), contentType: 'application/pdf' })
    expect(authorizePresignDownload(ORG, { organizationId: ORG, key })).toEqual({ ok: true })
  })

  it('403s when the requested org is not the active org', () => {
    const key = buildStorageKey({ tenantId: ORG, entity: 'document', entityId: randomUUID(), contentType: 'application/pdf' })
    const r = authorizePresignDownload(ORG, { organizationId: randomUUID(), key })
    expect(r).toEqual({ ok: false, status: 403, message: 'Organization mismatch' })
  })

  it('403s on a key belonging to another tenant', () => {
    const otherOrg = randomUUID()
    const key = buildStorageKey({ tenantId: otherOrg, entity: 'document', entityId: randomUUID(), contentType: 'application/pdf' })
    const r = authorizePresignDownload(ORG, { organizationId: ORG, key })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('400s on a malformed key', () => {
    const r = authorizePresignDownload(ORG, { organizationId: ORG, key: 'not/a/valid/key' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })
})

describe('authorizeFinalize', () => {
  const staged = (tenantId = ORG, entity: 'property_photo' | 'document' = 'property_photo', user = USER) =>
    buildStagingKey({ tenantId, entity, entityId: randomUUID(), contentType: entity === 'document' ? 'application/pdf' : 'image/jpeg' }, user)

  it("resolves the entity for the caller's own staged key", () => {
    const r = authorizeFinalize(ORG, { organizationId: ORG, key: staged() }, USER)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entity).toBe('property_photo')
  })

  it('403s on org mismatch', () => {
    const r = authorizeFinalize(ORG, { organizationId: randomUUID(), key: staged(ORG, 'document') }, USER)
    expect(r).toEqual({ ok: false, status: 403, message: 'Organization mismatch' })
  })

  it('403s on a key from another tenant', () => {
    const r = authorizeFinalize(ORG, { organizationId: ORG, key: staged(randomUUID(), 'document') }, USER)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('refuses a finalized (persisted) key, so finalize can never copy over or delete it', () => {
    const persisted = buildStorageKey({ tenantId: ORG, entity: 'property_photo', entityId: randomUUID(), contentType: 'image/jpeg' })
    expect(authorizeFinalize(ORG, { organizationId: ORG, key: persisted }, USER)).toEqual({ ok: false, status: 400, message: 'Not a staged upload (already finalized?)' })
  })

  it("refuses another user's staged key", () => {
    expect(authorizeFinalize(ORG, { organizationId: ORG, key: staged(ORG, 'property_photo', randomUUID()) }, USER))
      .toEqual({ ok: false, status: 403, message: 'Staged upload belongs to another user' })
  })

  it('refuses a staged key whose mac was tampered with', () => {
    const key = staged().replace(/-([0-9a-f]{16})\./u, (_, mac: string) => `-${mac.startsWith('0') ? '1' : '0'}${mac.slice(1)}.`)
    expect(authorizeFinalize(ORG, { organizationId: ORG, key }, USER)).toMatchObject({ ok: false, status: 403 })
  })
})

describe('assertOwnedAssetKey', () => {
  it('refuses to persist a staged key (finalize is mandatory)', async () => {
    await expect(assertOwnedAssetKey(buildStagingKey({ tenantId: ORG, entity: 'property_photo', entityId: randomUUID(), contentType: 'image/jpeg' }, USER), ORG, 'property_photo'))
      .rejects.toThrow(/finalize the upload first/)
  })
})

describe('roleMayUpload (WP-L02)', () => {
  it('mirrors the owning service: field may stage photos, not logos', () => {
    expect(roleMayUpload('field', 'property_photo')).toBe(true)
    expect(roleMayUpload('field', 'branding_logo')).toBe(false)
    expect(roleMayUpload('org_admin', 'branding_logo')).toBe(true)
  })

  it('lets every member upload their own avatar but nothing else for portal roles', () => {
    for (const role of ['homeowner', 'sub_contractor', 'stakeholder', 'viewer']) {
      expect(roleMayUpload(role, 'avatar')).toBe(true)
      expect(roleMayUpload(role, 'property_photo')).toBe(false)
    }
  })

  it('denies unknown roles', () => {
    expect(roleMayUpload('nobody', 'avatar')).toBe(false)
  })
})

describe('isStorageKey (WP-L02)', () => {
  it('accepts minted keys and rejects URLs / placeholders', () => {
    const key = buildStorageKey({ tenantId: ORG, entity: 'avatar', entityId: randomUUID(), contentType: 'image/png' })
    expect(isStorageKey(key)).toBe(true)
    expect(isStorageKey('https://cdn.example.com/a.png')).toBe(false)
    expect(isStorageKey('data:image/png;base64,AAAA')).toBe(false)
    expect(isStorageKey(`${ORG}/avatar/../../etc/passwd`)).toBe(false)
    expect(isStorageKey(null)).toBe(false)
  })
})
