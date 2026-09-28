/**
 * shared/mocks/push.mock.ts — MockPushService (WP-X3). Mirrors the real service
 * without VAPID keys: push disabled, subscribing refused, nothing to list/send.
 */
import { PushSubscribeInputSchema, type IPushService, type PushConfig, type PushDevice, type PushSendResult, type PushSubscribeInput } from '../contracts/push'
import { assertSameTenant, type TenantResolver } from './tenant'

export class MockPushService implements IPushService {
  constructor(private readonly tenantResolver?: TenantResolver) {}

  async config(organizationId: string): Promise<PushConfig> {
    assertSameTenant(this.tenantResolver, organizationId)
    return { enabled: false, vapidPublicKey: null }
  }

  async subscribe(input: PushSubscribeInput): Promise<PushDevice> {
    const parsed = PushSubscribeInputSchema.safeParse(input)
    if (!parsed.success) throw new Error('Invalid push subscription')
    assertSameTenant(this.tenantResolver, parsed.data.organizationId)
    throw new Error('Invalid push subscription: push is not enabled')
  }

  async unsubscribe(input: { organizationId: string, endpoint: string }): Promise<void> {
    assertSameTenant(this.tenantResolver, input.organizationId)
  }

  async listMine(organizationId: string): Promise<PushDevice[]> {
    assertSameTenant(this.tenantResolver, organizationId)
    return []
  }

  async sendTest(organizationId: string): Promise<PushSendResult> {
    assertSameTenant(this.tenantResolver, organizationId)
    return { sent: 0, revoked: 0, failed: 0 }
  }
}
