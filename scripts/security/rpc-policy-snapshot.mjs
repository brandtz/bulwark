#!/usr/bin/env node
/**
 * scripts/security/rpc-policy-snapshot.mjs — write the reviewed RPC role
 * matrix (WP-Q2).
 *
 * `tests/rbac/rpc-policy.snapshot.json` is the independent expectation the
 * RBAC tests check against. Tests that derived their expectations from
 * server/utils/rpc-policy.ts itself would pass even after someone widened a
 * gate; with a committed snapshot, any policy change fails
 * tests/unit/rpc-policy-snapshot.test.ts until the snapshot is regenerated with
 * this script — which puts the widened row in front of a reviewer as a diff.
 *
 *   node scripts/security/rpc-policy-snapshot.mjs          # write
 *   node scripts/security/rpc-policy-snapshot.mjs --check  # exit 1 if stale
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { register } from 'tsx/esm/api'

register()
const { RPC_POLICY } = await import('../../server/utils/rpc-policy.ts')

const ROLES = ['super_admin', 'org_admin', 'org_manager', 'field', 'viewer', 'sub_contractor', 'homeowner', 'stakeholder']

/** service -> method -> 'public' | 'system' | sorted role list. Sorted keys so diffs are stable. */
const snapshot = {}
for (const service of Object.keys(RPC_POLICY).sort()) {
  snapshot[service] = {}
  for (const method of Object.keys(RPC_POLICY[service]).sort()) {
    const rule = RPC_POLICY[service][method]
    snapshot[service][method] = typeof rule === 'string' ? rule : ROLES.filter((r) => rule.includes(r))
  }
}
const text = JSON.stringify({ roles: ROLES, policy: snapshot }, null, 2) + '\n'
const out = 'tests/rbac/rpc-policy.snapshot.json'

if (process.argv.includes('--check')) {
  let current = ''
  try { current = readFileSync(out, 'utf8').replace(/\r\n/gu, '\n') } catch { /* missing */ }
  if (current !== text) {
    console.error(`${out} is stale: server/utils/rpc-policy.ts changed. Review the change, then run: node scripts/security/rpc-policy-snapshot.mjs`)
    process.exit(1)
  }
  console.log(`${out} is current.`)
} else {
  mkdirSync('tests/rbac', { recursive: true })
  writeFileSync(out, text)
  const methods = Object.values(snapshot).reduce((n, m) => n + Object.keys(m).length, 0)
  console.log(`wrote ${out} (${Object.keys(snapshot).length} services, ${methods} methods)`)
}
