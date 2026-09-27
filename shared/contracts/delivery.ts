import { z } from 'zod'
import { UuidSchema } from './_shared'

export const DeliveryChannelSchema = z.enum(['email', 'sms'])
export type DeliveryChannel = z.infer<typeof DeliveryChannelSchema>

export const DeliveryStatusSchema = z.enum(['sent', 'stubbed', 'failed'])
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>

export const DeliveryRowSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  channel: DeliveryChannelSchema,
  provider: z.string().min(1),
  status: DeliveryStatusSchema,
  providerMessageId: z.string().nullable(),
  error: z.string().nullable(),
  eventType: z.string().nullable(),
  relatedEntityType: z.string().nullable(),
  relatedEntityId: UuidSchema.nullable(),
  attempt: z.number().int().positive(),
  createdAt: z.string().datetime(),
})
export type DeliveryRow = z.infer<typeof DeliveryRowSchema>

export const DeliveryHealthInputSchema = z.object({
  organizationId: UuidSchema,
  since: z.string().datetime(),
})
export type DeliveryHealthInput = z.infer<typeof DeliveryHealthInputSchema>

export const DeliveryHealthOutputSchema = z.object({
  sent: z.number().int().nonnegative(),
  stubbed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  recentFailures: z.array(DeliveryRowSchema),
})
export type DeliveryHealthOutput = z.infer<typeof DeliveryHealthOutputSchema>

export interface ICommsService {
  deliveryHealth(input: DeliveryHealthInput): Promise<DeliveryHealthOutput>
}