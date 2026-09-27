#!/usr/bin/env node
/**
 * scripts/codegraph/scaffold-screen-test.mjs <DESIGN-ID> [--force]
 *
 * Generates tests/e2e/screens/<ID>.spec.ts from the design SPEC (via graph.json):
 *   - describeScreen() contract (viewports, dark, axe, test ids, role gate, touch targets)
 *   - one `test.fixme` per SPEC state  → the implementing agent must make each state reachable and assert it
 *   - one `test.fixme` per SPEC action → assert the permitted role can perform it AND a forbidden role cannot
 *   - a visual parity fixme per variant
 * The generated file FAILS (fixme) until filled in — it can never pass by default.
 *
 * Also: `--all-received` scaffolds every received design that has no spec yet.
 */
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const argValue = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
// --spec-file=<SPEC.md> [--route=/x] [--title=...] scaffolds one design from a tracked fixture
// without the generated graph or the ignored design exports (used by CI self-tests).
const specFileArg = argValue('spec-file')
const GRAPH = specFileArg
  ? { nodes: [] }
  : JSON.parse(await fs.readFile(path.join(ROOT, 'agents', 'codegraph', 'graph.json'), 'utf8'))
const force = args.includes('--force')
const outDirArg = args.find((a) => a.startsWith('--out-dir='))
const OUT = outDirArg ? path.resolve(outDirArg.slice('--out-dir='.length)) : path.join(ROOT, 'tests', 'e2e', 'screens')
const ids = args.includes('--all-received')
  ? GRAPH.nodes.filter((n) => n.type === 'design' && n.status === 'received' && n.spec).map((n) => n.id.replace('design:', ''))
  : args.filter((a) => !a.startsWith('--'))
if (!ids.length) { console.error('usage: scaffold-screen-test.mjs <ID> [--force] | --all-received'); process.exit(1) }

const ROLE_MAP = { 'org_admin': 'org_admin', 'org_manager': 'org_manager', 'super_admin': 'super_admin', 'field': 'field', 'sub': 'sub_contractor', 'sub_contractor': 'sub_contractor', 'client': 'homeowner', 'homeowner': 'homeowner', 'viewer': 'viewer', 'stakeholder': 'stakeholder', 'manager+': 'org_manager', 'admin': 'org_admin' }

function parseSpec(md) {
  const roleLine = md.match(/Roles:\s*([^|\n]+)/)?.[1] ?? ''
  const roles = [...new Set([...roleLine.matchAll(/[a-z_+]+/g)].map((m) => ROLE_MAP[m[0]]).filter(Boolean))]
  const table = (heading) => {
    const sec = md.match(new RegExp(`## ${heading}[^\\n]*\\n([\\s\\S]*?)(?:\\n## |$)`))?.[1] ?? ''
    return sec.split('\n').filter((l) => l.startsWith('|') && !/^\|\s*-+/.test(l)).slice(1).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
  }
  const states = table('States').map(([state, look, trigger]) => ({ state, look, trigger })).filter((s) => s.state && !/^State$/i.test(s.state))
  const actions = table('Actions').map(([action, kind, leadsTo, permission, confirm]) => ({ action, kind, leadsTo, permission, confirm })).filter((a) => a.action && !/^Action$/i.test(a.action))
  const testIds = [...new Set([...md.matchAll(/data-testid=["']([^"']+)["']|`([a-z0-9-]+)`\s*\(testid\)/g)].map((m) => m[1] ?? m[2]))]
  const touch = md.match(/Touch target audit[^\n]*/)?.[0] ?? ''
  const isField = /FD-|SC-/.test(md.slice(0, 40))
  return { roles: roles.length ? roles : ['org_admin'], states, actions, testIds, touch, isField }
}

const ident = (s) => s.replace(/[^a-zA-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')

for (const id of ids) {
  const node = specFileArg
    ? { spec: path.relative(ROOT, path.resolve(specFileArg)).replace(/\\/g, '/'), routes: [argValue('route') ?? '/'], title: argValue('title') ?? id }
    : GRAPH.nodes.find((n) => n.id === `design:${id}`)
  if (!node?.spec) { console.error(`✖ ${id}: no received SPEC`); continue }
  const out = path.join(OUT, `${id}.spec.ts`)
  if (existsSync(out) && !force) { console.log(`· ${id}: exists (use --force to overwrite)`); continue }
  const md = await fs.readFile(path.join(ROOT, node.spec), 'utf8')
  const spec = parseSpec(md)
  const route = (node.routes ?? [])[0] ?? '/'
  const hasParams = route.includes(':')
  const publicRoute = route === '/login'
  const viewports = spec.isField ? `['desktop', 'tablet', 'mobile']` : `['desktop', 'mobile']`

  const stateTests = spec.states.map((s) => `
  test.fixme('state: ${ident(s.state)} — ${ident(s.look).slice(0, 80)}', async () => {
    // fixtures: async ({ page, context }) — add when implementing
    // Trigger: ${ident(s.trigger)}
    // 1. Put the screen into this state (seed/fixture/network mock) — do NOT stub the component.
    // 2. Assert the visible result described in the SPEC (text, badge hue via data-hue, disabled controls).
    // 3. Assert what must NOT be visible in this state.
  })`).join('\n')

  const actionTests = spec.actions.map((a) => `
  test.fixme('action: ${ident(a.action)} (${ident(a.kind)}) → ${ident(a.leadsTo).slice(0, 60)}', async () => {
    // fixtures: async ({ page, browser }) — add when implementing
    // Permission: ${ident(a.permission)} · Confirm: ${ident(a.confirm)}
    // Positive: as a permitted role, perform the action and assert the outcome (navigation/toast/state change) and the audit/API side effect.
    // Negative: as a NON-permitted seeded role, assert the control is absent AND the underlying API call returns 403 (use page.request.post on /api/services/<svc>/<method>).
${/L[123]/.test(a.confirm) ? '    // Confirm ladder: assert the confirm dialog appears and that cancelling leaves state unchanged.' : ''}
  })`).join('\n')

  const file = `/**
 * ${id} — ${node.title}
 * Generated by scripts/codegraph/scaffold-screen-test.mjs from ${node.spec}
 * Route: ${route} · Roles: ${spec.roles.join(', ')}
 *
 * Fill every test.fixme. A WP cannot move to review while a fixme remains (pnpm screen:audit).
 * Tests must challenge the implementation: assert negatives, forbidden roles, and side effects —
 * not just that the happy path renders.
 */
import { test } from '@playwright/test' // add expect when implementing the fixmes
import { describeScreen, resolveRoute } from './_contract'
import { expectVisualParity } from './_visual'

const ID = '${id}'
${hasParams ? `// TODO(agent): resolve a real ${route} from seed data (see tests/e2e/_helpers.ts / _reseed.ts)
const route = async () => { throw new Error('resolve route for ${route}') }` : `const route = '${route}'`}

describeScreen({
  id: ID,
  route,
  roles: ${JSON.stringify(spec.roles)},
  ${publicRoute ? 'publicRoute: true,' : ''}
  viewports: ${viewports},
  testIds: ${JSON.stringify(spec.testIds)},
  // axeAllow: { 'rule-id': 'ED-xxx justification' },
}, () => {
  test.describe('states (from SPEC)', () => {${stateTests || `
  test.fixme('SPEC has no States table — add states to the SPEC or justify here', async () => {})`}
  })

  test.describe('actions (from SPEC)', () => {${actionTests || `
  test.fixme('SPEC has no Actions table — add actions to the SPEC or justify here', async () => {})`}
  })

  test.describe('visual parity with design', () => {
    for (const variant of ['desktop', 'mobile', 'dark'${spec.isField ? ", 'tablet'" : ''}] as const) {
      test.fixme(\`matches design \${variant}\`, async ({ page }) => {
        await page.goto(await resolveRoute(page, route))
        await expectVisualParity(page, { id: ID, variant /*, mask: ['[data-testid=…]'] */ })
      })
    }
  })
})
`
  await fs.mkdir(OUT, { recursive: true })
  await fs.writeFile(out, file)
  console.log(`✔ ${id}: ${path.relative(ROOT, out)} (${spec.states.length} states, ${spec.actions.length} actions)`)
}
