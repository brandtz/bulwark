#!/usr/bin/env node
/**
 * scripts/codegraph/export-matrix.mjs — persona × action matrix from the received
 * design SPECs (WP-Q2).
 *
 * Parses the `## Actions` table of every received SPEC.md and normalizes its
 * Permission column into concrete roles, writing tests/e2e/_matrix.generated.json:
 *   { design, routes, action, kind, permission (raw), roles | null, capability?, condition?, note? }
 * `roles: null` = no role restriction (anyone who can see the screen).
 *
 * `--check` fails when the file is stale or any permission is unrecognized, so a
 * new SPEC vocabulary word must be mapped here before it can land. SCR work
 * packages turn their screen's rows into UI assertions (control absent for
 * other roles) in their screen-contract spec; the API side of every row is the
 * RPC matrix (tests/e2e/rbac-matrix.spec.ts).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'agents/design/return/design-return'
const OUT = 'tests/e2e/_matrix.generated.json'
const graph = JSON.parse(readFileSync('agents/codegraph/graph.json', 'utf8'))
const designNodes = Object.values(graph.nodes ?? graph).filter((n) => n.type === 'design' && n.status === 'received')
const routesBySpec = new Map(designNodes.map((d) => [d.spec?.replace(/\\/gu, '/'), d.routes ?? []]))

const ALL = ['super_admin', 'org_admin', 'org_manager', 'field', 'viewer', 'sub_contractor', 'homeowner', 'stakeholder']
const MANAGER_UP = ['super_admin', 'org_admin', 'org_manager']
const STAFF_READ = [...MANAGER_UP, 'field', 'viewer']

/** Permission word -> { roles?, capability?, condition?, note? }. Keys are lowercased. */
const VOCAB = {
  '—': { roles: null }, '-': { roles: null }, '': { roles: null }, 'all': { roles: null },
  'manager+': { roles: MANAGER_UP },
  'org_admin': { roles: ['super_admin', 'org_admin'] },
  'admin': { roles: ['super_admin', 'org_admin'] },
  'super_admin': { roles: ['super_admin'] },
  'owner': { roles: ['super_admin', 'org_admin'], note: 'tenant owner — no distinct role yet; org_admin until one exists' },
  'field': { roles: ['field'] }, 'field role': { roles: ['field'] },
  'field+': { roles: [...MANAGER_UP, 'field'] },
  'manager+ / field': { roles: [...MANAGER_UP, 'field'] },
  'read': { roles: STAFF_READ },
  'self': { roles: ALL, note: 'caller acts on their own record' },
  'client': { roles: ['homeowner'] },
  'sub_contractor': { roles: ['sub_contractor'] }, 'sub': { roles: ['sub_contractor'] },
  'stakeholder': { roles: ['stakeholder'] },
  'owner or manager+ for shared': { roles: MANAGER_UP, note: 'owner of a private view, manager+ for shared ones' },
  // Pre-auth / conditional actions: not role-gated.
  'anonymous': { roles: null, condition: 'signed out' },
  'invitee': { roles: null, condition: 'holds a valid invite' },
  'valid token': { roles: null, condition: 'holds a valid token' },
  'signed-in user matches invite email': { roles: null, condition: 'session email matches the invite' },
  'device has cached session': { roles: null, condition: 'offline session present' },
  '>1 membership': { roles: null, condition: 'user belongs to more than one org' },
  'membership active': { roles: null, condition: 'active membership' },
  'mfa on': { roles: null, condition: 'MFA enrolled' },
  'within grace': { roles: null, condition: 'inside the grace window' },
  'enabled after countdown': { roles: null, condition: 'after countdown' },
  'acknowledged checkbox': { roles: null, condition: 'acknowledgement checked' },
  'not sole admin': { roles: ['super_admin', 'org_admin'], condition: 'another admin remains' },
  'org admin': { roles: ['super_admin', 'org_admin'] },
  'owner only': { roles: ['super_admin', 'org_admin'], note: 'tenant owner — no distinct role yet' },
  'super_admin + flag': { roles: ['super_admin'], condition: 'feature flag enabled' },
  'gate satisfied': { roles: null, condition: 'confirmation gate satisfied' },
  'token-bound': { roles: null, condition: 'holds a valid token' },
  'per-capability': { roles: null, note: 'each row is gated by its own capability' },
  // Template placeholders in generic pattern specs (SH-41 etc.).
  'permission': { roles: null, note: 'pattern spec placeholder — the using screen defines it' },
  'role': { roles: null, note: 'pattern spec placeholder — the using screen defines it' },
}
/** `claims.write`, optionally with a scope note: `claims.approve (scoped to the claim)`. */
const CAPABILITY = /^([a-z]+\.(read|write|approve|comment|install|publish))(\s*\(.*\))?$/u

function normalize(raw) {
  const key = raw.trim().toLowerCase().replace(/\s+/gu, ' ')
  if (Object.hasOwn(VOCAB, key)) return { ...VOCAB[key] }
  const cap = CAPABILITY.exec(key)
  if (cap) return { roles: null, capability: cap[1], ...(cap[3] ? { note: cap[3].trim().slice(1, -1) } : {}) }
  return null
}

function cells(line) {
  return line.trim().replace(/^\||\|$/gu, '').split('|').map((c) => c.trim())
}

const rows = []
const unparsed = []
for (const pk of readdirSync(ROOT).sort()) {
  const screens = join(ROOT, pk, 'screens')
  if (!existsSync(screens)) continue
  for (const dir of readdirSync(screens).sort()) {
    const spec = join(screens, dir, 'SPEC.md').replace(/\\/gu, '/')
    if (!existsSync(spec)) continue
    const text = readFileSync(spec, 'utf8').replace(/\r\n/gu, '\n')
    const m = /^## Actions[ \t]*\n([\s\S]*?)(?=\n## |(?![\s\S]))/mu.exec(text)
    if (!m) continue
    const table = m[1].split('\n').filter((l) => l.trim().startsWith('|'))
    if (table.length < 3) continue
    const header = cells(table[0]).map((h) => h.toLowerCase())
    const col = (name) => header.findIndex((h) => h.startsWith(name))
    const [iAction, iKind, iPerm] = [col('action'), col('kind'), col('permission')]
    const design = /^[A-Z]{2}-\d{2}[a-z]?/u.exec(dir)?.[0] ?? dir
    for (const line of table.slice(2)) {
      const c = cells(line)
      const permission = iPerm >= 0 ? (c[iPerm] ?? '') : ''
      const parsed = normalize(permission)
      const row = { design, routes: routesBySpec.get(spec) ?? [], action: c[iAction] ?? '', kind: iKind >= 0 ? (c[iKind] ?? '') : '', permission }
      if (!parsed) unparsed.push(`${design}: "${permission}" (${row.action})`)
      rows.push({ ...row, ...(parsed ?? { roles: null, unparsed: true }) })
    }
  }
}

const text = JSON.stringify({ generatedFrom: ROOT, actions: rows }, null, 1) + '\n'
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/gu, '\n') : ''
  const problems = []
  if (unparsed.length) problems.push(`${unparsed.length} unrecognized permission value(s) — add them to VOCAB:\n  ${unparsed.join('\n  ')}`)
  if (current !== text) problems.push(`${OUT} is stale — run: node scripts/codegraph/export-matrix.mjs`)
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log(`persona × action matrix current: ${rows.length} actions, 0 unrecognized permissions.`)
} else {
  writeFileSync(OUT, text)
  const gated = rows.filter((r) => r.roles !== null || r.capability).length
  console.log(`wrote ${OUT}: ${rows.length} actions (${gated} role/capability-gated), ${unparsed.length} unrecognized`)
  if (unparsed.length) console.log(unparsed.slice(0, 40).join('\n'))
}
