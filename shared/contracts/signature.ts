/**
 * shared/contracts/signature.ts — in-house e-signatures (WP-X2, ED-00D).
 *
 * # Decisions (ED-00D)
 *   - Typed or drawn attestation with explicit consent, captured with the
 *     signer's IP, user agent and timestamp, and a sha256 of the exact document
 *     content they saw. Typed names are legally sufficient under ESIGN/UETA for
 *     these B2C contracts and keep keyboard-only signing possible.
 *   - **Append-only.** No update or delete. A changed document needs a new
 *     signature; `verify` tells whether a stored signature still matches a
 *     document hash.
 *   - Staff (field+) may record signatures on any entity in their org; a
 *     homeowner only on quotes / change orders for properties they belong to.
 *     IP and user agent come from the request, never from the client payload.
 */
import { z } from 'zod'
import { UuidSchema } from './_shared'
import { StorageObjectKeySchema } from './storage'

export const SignedEntityTypeSchema = z.enum(['inspection', 'quote', 'change_order', 'deliverable'])
export type SignedEntityType = z.infer<typeof SignedEntityTypeSchema>

export const SignatureSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  entityType: SignedEntityTypeSchema,
  entityId: UuidSchema,
  signerName: z.string(),
  signerEmail: z.string().nullable(),
  signerUserId: UuidSchema.nullable(),
  method: z.enum(['typed', 'drawn']),
  imageKey: z.string().nullable(),
  consent: z.literal(true),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  documentHash: z.string(),
  signedAt: z.string(),
})
export type Signature = z.infer<typeof SignatureSchema>

export const SignatureCreateInputSchema = z.object({
  organizationId: UuidSchema,
  entityType: SignedEntityTypeSchema,
  entityId: UuidSchema,
  signerName: z.string().trim().min(2).max(160),
  signerEmail: z.string().trim().email().max(254).nullable().optional(),
  method: z.enum(['typed', 'drawn']),
  /** Finalized storage key of the drawn image; required for `drawn`. */
  imageKey: StorageObjectKeySchema.nullable().optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required to sign' }) }),
  /** sha256 hex of the document content presented to the signer. */
  documentHash: z.string().regex(/^[a-f0-9]{64}$/u, 'documentHash must be a sha256 hex digest'),
}).refine((v) => v.method !== 'drawn' || !!v.imageKey, { message: 'A drawn signature needs its image', path: ['imageKey'] })
export type SignatureCreateInput = z.input<typeof SignatureCreateInputSchema>

export interface ISignatureService {
  create(input: SignatureCreateInput): Promise<Signature>
  get(id: string, organizationId: string): Promise<Signature | null>
  listForEntity(input: { organizationId: string, entityType: SignedEntityType, entityId: string }): Promise<Signature[]>
  /** Does the stored signature match this document hash (i.e. the document is unchanged)? */
  verify(input: { organizationId: string, id: string, documentHash: string }): Promise<{ valid: boolean }>
}
