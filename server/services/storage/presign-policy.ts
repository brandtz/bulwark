/**
 * server/services/storage/presign-policy.ts — pure presign authorization (L01-S2).
 *
 * The security decisions for the presign endpoints live here as pure functions so
 * unit tests can drive every branch without the h3 runtime (the same split the
 * rate-limiter uses: pure policy in utils, thin adapter in the handler).
 *
 * Firewall: the caller's ACTIVE organization is authoritative. An upload key is
 * always minted under the active org; a download is allowed only when both the
 * request's `organizationId` AND the key's tenant prefix match the active org.
 */
import { buildStorageKey, parseStorageKey } from './keys'
import {
  StorageEntityKindSchema,
  validateUpload,
  type FinalizeUploadInput,
  type PresignDownloadInput,
  type PresignUploadInput,
  type StorageEntityKind,
} from '../../../shared/contracts/storage'

export type PresignDenial = { ok: false; status: 400 | 403; message: string }

/**
 * Which roles may upload each asset kind (WP-L02). Mirrors the RPC policy of the
 * owning service's create method, so a role that cannot attach a photo cannot
 * stage one either. Avatars are personal, so every member may upload their own.
 */
const UPLOAD_ROLES: Record<StorageEntityKind, readonly string[]> = {
  property_photo: ['super_admin', 'org_admin', 'org_manager', 'field'],
  property_attachment: ['super_admin', 'org_admin', 'org_manager', 'field'],
  document: ['super_admin', 'org_admin', 'org_manager', 'field'],
  branding_logo: ['super_admin', 'org_admin', 'org_manager'],
  avatar: ['super_admin', 'org_admin', 'org_manager', 'field', 'viewer', 'sub_contractor', 'homeowner', 'stakeholder'],
}

export function roleMayUpload(role: string, entity: StorageEntityKind): boolean {
  return UPLOAD_ROLES[entity]?.includes(role) ?? false
}
export type UploadAuthz = { ok: true; key: string } | PresignDenial
export type DownloadAuthz = { ok: true } | PresignDenial

/** Authorize an upload presign + mint the storage key under the active org. */
export function authorizePresignUpload(
  activeOrganizationId: string,
  input: PresignUploadInput,
): UploadAuthz {
  // Deliberate explicit comparison (not assertSameTenant): these standalone
  // endpoints map directly to HTTP status, so we return 403 here rather than
  // throwing TenantViolationError and translating it. Same single-org anchor.
  if (input.organizationId !== activeOrganizationId) {
    return { ok: false, status: 403, message: 'Organization mismatch' }
  }
  const v = validateUpload(input.entity, input.contentType, input.sizeBytes)
  if (!v.ok) return { ok: false, status: 400, message: v.reason }
  // tenantId is the ACTIVE org, never the client-sent value — defense in depth.
  const key = buildStorageKey({
    tenantId: activeOrganizationId,
    entity: input.entity,
    entityId: input.entityId,
    contentType: input.contentType,
  })
  return { ok: true, key }
}

/**
 * Authorize a download presign. Scope is ORG-LEVEL ONLY: the request org and the
 * key's tenant prefix must both equal the active org. It deliberately does NOT
 * verify the caller may access the specific entity embedded in the key — per-entity
 * RBAC is the owning service's job (L02 maps keys to signed URLs server-side, only
 * after an ownership check). The future insurer role (L15) must therefore mint
 * downloads via entity-scoped service methods, not this generic endpoint.
 * (L01-S2 skeptic P1-1.)
 */
export function authorizePresignDownload(
  activeOrganizationId: string,
  input: PresignDownloadInput,
): DownloadAuthz {
  if (input.organizationId !== activeOrganizationId) {
    return { ok: false, status: 403, message: 'Organization mismatch' }
  }
  let tenantId: string
  try {
    tenantId = parseStorageKey(input.key).tenantId
  } catch {
    return { ok: false, status: 400, message: 'Invalid object key' }
  }
  if (tenantId !== activeOrganizationId) {
    return { ok: false, status: 403, message: 'Cross-tenant object access denied' }
  }
  return { ok: true }
}

export type FinalizeAuthz = { ok: true; entity: StorageEntityKind } | PresignDenial

/**
 * Authorize the post-upload finalize and resolve the entity kind from the key, so
 * the caller can HEAD the stored object and enforce the real size/content-type rule
 * (the presigned PUT itself cannot bind body size — L01-S2 skeptic P0-1).
 */
export function authorizeFinalize(
  activeOrganizationId: string,
  input: FinalizeUploadInput,
): FinalizeAuthz {
  if (input.organizationId !== activeOrganizationId) {
    return { ok: false, status: 403, message: 'Organization mismatch' }
  }
  let parsedEntity: string
  try {
    const parsed = parseStorageKey(input.key)
    if (parsed.tenantId !== activeOrganizationId) {
      return { ok: false, status: 403, message: 'Cross-tenant object access denied' }
    }
    parsedEntity = parsed.entity
  } catch {
    return { ok: false, status: 400, message: 'Invalid object key' }
  }
  const entity = StorageEntityKindSchema.safeParse(parsedEntity)
  if (!entity.success) {
    return { ok: false, status: 400, message: 'Unknown entity in key' }
  }
  return { ok: true, entity: entity.data }
}
