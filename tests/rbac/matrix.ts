/**
 * tests/rbac/matrix.ts — pure helpers for the RPC role matrix (WP-Q2).
 *
 * The expectation source is `rpc-policy.snapshot.json` (committed, reviewed),
 * never server/utils/rpc-policy.ts itself — see
 * scripts/security/rpc-policy-snapshot.mjs for why.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type Rule = 'public' | 'system' | string[]
export type Policy = Record<string, Record<string, Rule>>

// Read, not `import`: Playwright's ESM loader requires JSON import attributes
// that Vitest's transform does not accept; fs works in both runners.
export const SNAPSHOT = JSON.parse(
  readFileSync(fileURLToPath(new URL('./rpc-policy.snapshot.json', import.meta.url)), 'utf8'),
) as { roles: string[], policy: Policy }
export const ROLES = SNAPSHOT.roles

/** Normalize a live policy (readonly role arrays, any order) to the snapshot shape. */
export function normalizePolicy(live: Record<string, Record<string, unknown>>): Policy {
  const out: Policy = {}
  for (const service of Object.keys(live).sort()) {
    out[service] = {}
    for (const method of Object.keys(live[service]!).sort()) {
      const rule = live[service]![method]
      out[service]![method] = typeof rule === 'string' ? (rule as 'public' | 'system') : ROLES.filter((r) => (rule as readonly string[]).includes(r))
    }
  }
  return out
}

/** Every difference between two policies, as readable lines ("quote.create: +viewer"). */
export function diffPolicy(live: Policy, expected: Policy): string[] {
  const out: string[] = []
  const services = new Set([...Object.keys(live), ...Object.keys(expected)])
  for (const s of services) {
    const methods = new Set([...Object.keys(live[s] ?? {}), ...Object.keys(expected[s] ?? {})])
    for (const m of methods) {
      const a = live[s]?.[m]
      const b = expected[s]?.[m]
      if (a === undefined) { out.push(`${s}.${m}: missing from live policy`); continue }
      if (b === undefined) { out.push(`${s}.${m}: not in snapshot (new method, unreviewed)`); continue }
      if (typeof a === 'string' || typeof b === 'string') {
        if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${s}.${m}: ${JSON.stringify(b)} -> ${JSON.stringify(a)}`)
        continue
      }
      const added = a.filter((r) => !b.includes(r))
      const removed = b.filter((r) => !a.includes(r))
      if (added.length || removed.length) out.push(`${s}.${m}: ${[...added.map((r) => `+${r}`), ...removed.map((r) => `-${r}`)].join(' ')}`)
    }
  }
  return out
}

export interface DenialCase { service: string, method: string, role: string | null, status: 401 | 403 }

/**
 * Every (method, caller) pair the snapshot forbids, with the status the HTTP
 * boundary must return. `role: null` = signed out. Allowed pairs are not listed:
 * firing arbitrary allowed calls would mutate state (e.g. account.requestDeletion).
 */
export function denialCases(policy: Policy = SNAPSHOT.policy): DenialCase[] {
  const out: DenialCase[] = []
  for (const [service, methods] of Object.entries(policy)) {
    for (const [method, rule] of Object.entries(methods)) {
      if (rule === 'public') continue
      out.push({ service, method, role: null, status: rule === 'system' ? 403 : 401 })
      for (const role of ROLES) {
        if (rule === 'system' || !rule.includes(role)) out.push({ service, method, role, status: 403 })
      }
    }
  }
  return out
}
