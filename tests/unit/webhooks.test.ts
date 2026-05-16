/**
 * tests/unit/webhooks.test.ts — W2-4.
 *
 * Proves the HMAC signing round-trip and that webhook.create() returns
 * the raw secret exactly once (issue-once contract).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MockWebhookService,
  __resetMockWebhooksForTests,
} from '~~/shared/mocks/webhook.mock'
import {
  signWebhookPayload,
  verifyWebhookSignature,
} from '~~/shared/utils/webhook-signature'
import {
  WEBHOOK_SIGNATURE_ALGORITHM,
  WEBHOOK_SIGNATURE_HEADER,
} from '~~/shared/contracts/webhook'
import type { TenantResolver } from '~~/shared/mocks/tenant'
import { FIXTURE_ORG_ID, FIXTURE_USER_ADMIN } from '~~/shared/mocks/fixtures'

const adminResolver: TenantResolver = () => ({
  userId: FIXTURE_USER_ADMIN.userId,
  organizationId: FIXTURE_ORG_ID,
})

beforeEach(() => {
  __resetMockWebhooksForTests()
})

describe('webhook signature', () => {
  it('signs and verifies a payload', () => {
    const body = JSON.stringify({ hello: 'world', ts: 123 })
    const secret = 'whsec_test_abc'
    const sig = signWebhookPayload(body, secret)
    expect(sig.header).toBe(WEBHOOK_SIGNATURE_HEADER)
    expect(sig.algorithm).toBe(WEBHOOK_SIGNATURE_ALGORITHM)
    expect(sig.value.startsWith(`${WEBHOOK_SIGNATURE_ALGORITHM}=`)).toBe(true)
    expect(verifyWebhookSignature(body, secret, sig.value)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const secret = 'whsec_test'
    const sig = signWebhookPayload('{"a":1}', secret)
    expect(verifyWebhookSignature('{"a":2}', secret, sig.value)).toBe(false)
  })

  it('rejects a wrong secret', () => {
    const sig = signWebhookPayload('{"a":1}', 'secret-1')
    expect(verifyWebhookSignature('{"a":1}', 'secret-2', sig.value)).toBe(false)
  })
})

describe('MockWebhookService.create', () => {
  it('issues a secret exactly once on create + redacts thereafter', async () => {
    const svc = new MockWebhookService(adminResolver)
    const r = await svc.create({
      organizationId: FIXTURE_ORG_ID,
      name: 'Listener',
      url: 'https://example.test/hook',
      eventTypes: ['user.invited'],
    })
    expect(r.secret).toMatch(/^whsec_/)
    expect(r.row.secretPrefix.length).toBeGreaterThan(0)
    // subsequent list() must NOT echo the raw secret
    const list = await svc.list(FIXTURE_ORG_ID)
    const fetched = list.rows.find((w) => w.id === r.row.id)
    expect(fetched).toBeDefined()
    expect(JSON.stringify(fetched)).not.toContain(r.secret)
  })
})
