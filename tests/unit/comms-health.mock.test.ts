/** WP-L03 — MockCommsService parity with RealCommsService.deliveryHealth. */
import { afterEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { __recordMockDelivery, __resetMockCommsForTests, MockCommsService } from '../../shared/mocks/comms.mock'
import { TenantViolationError } from '../../shared/mocks/tenant'
import type { DeliveryRow } from '../../shared/contracts/delivery'

const organizationId = randomUUID()
const otherOrganizationId = randomUUID()
const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()

function row(overrides: Partial<DeliveryRow>): DeliveryRow {
  return {
    id: randomUUID(),
    organizationId,
    channel: 'email',
    provider: 'resend',
    status: 'sent',
    providerMessageId: null,
    error: null,
    eventType: null,
    relatedEntityType: null,
    relatedEntityId: null,
    attempt: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

afterEach(() => __resetMockCommsForTests())

describe('MockCommsService.deliveryHealth', () => {
  it('counts the window and lists recent failures for the tenant only', async () => {
    __recordMockDelivery(row({ status: 'sent' }))
    __recordMockDelivery(row({ status: 'stubbed', channel: 'sms' }))
    __recordMockDelivery(row({ status: 'failed', error: 'HTTP 503' }))
    __recordMockDelivery(row({ status: 'failed', error: 'old', createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() }))
    __recordMockDelivery(row({ status: 'failed', organizationId: otherOrganizationId }))
    const service = new MockCommsService(() => ({ userId: 'u1', organizationId }))
    const health = await service.deliveryHealth({ organizationId, since })
    expect(health).toMatchObject({ sent: 1, stubbed: 1, failed: 1 })
    expect(health.byChannel).toEqual({
      email: { sent: 1, stubbed: 0, failed: 1 },
      sms: { sent: 0, stubbed: 1, failed: 0 },
    })
    expect(health.recentFailures.map((r) => r.error)).toEqual(['HTTP 503'])
  })

  it('rejects another tenant and a malformed window', async () => {
    const service = new MockCommsService(() => ({ userId: 'u1', organizationId }))
    await expect(service.deliveryHealth({ organizationId: otherOrganizationId, since })).rejects.toBeInstanceOf(TenantViolationError)
    await expect(service.deliveryHealth({ organizationId, since: 'yesterday' })).rejects.toThrow()
  })
})
