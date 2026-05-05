/**
 * shared/contracts/api-key.ts — programmatic credentials (E9-S7).
 *
 * # Decisions (ADR-0008)
 *   - Issue-once: `create()` returns the raw secret EXACTLY ONCE in
 *     the response payload. Subsequent reads only surface a prefix
 *     (e.g. `bw_pk_…`) so a leaked DB row can't be replayed.
 *   - Revoke is a soft delete (`revokedAt` timestamp). We never hard-
 *     delete keys so audit trails stay intact.
 *
 * # Decision cast down
 *   - Rejected: scoped permissions per key in v1. Drew's demo only
 *     needs "issue / list / revoke"; scope filters land when a
 *     real customer asks.
 */
import { z } from 'zod'

export const ApiKeySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  label: z.string(),
  prefix: z.string(),
  createdAt: z.string(),
  createdById: z.string().nullable(),
  revokedAt: z.string().nullable(),
})
export type ApiKey = z.infer<typeof ApiKeySchema>

export const ApiKeyCreateInputSchema = z.object({
  organizationId: z.string(),
  label: z.string().min(1).max(64),
  createdById: z.string().nullable(),
})
export type ApiKeyCreateInput = z.infer<typeof ApiKeyCreateInputSchema>

export interface ApiKeyCreateResult {
  row: ApiKey
  /** Raw secret — surfaced only once, on creation. */
  secret: string
}

export interface IApiKeyService {
  list(orgId: string): Promise<ApiKey[]>
  create(input: ApiKeyCreateInput): Promise<ApiKeyCreateResult>
  revoke(id: string, orgId: string): Promise<ApiKey>
}
