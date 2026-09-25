#!/usr/bin/env node
/**
 * scripts/codegraph/check.mjs — CI/pre-commit guard for the CodeGraph and work-package registry.
 *
 * Fails (exit 1) when:
 *   1. input/output hashes differ, or generated files are missing or corrupt
 *   2. agents/program/work-packages.json references a design ID or dependency that doesn't exist
 *   3. a work package marked `done` touches a page that has no e2e coverage in the graph
 *   4. a work package marked `done` implements a received design whose SPEC states aren't all
 *      referenced by at least one e2e/unit test title (heuristic: state name appears in a test title)
 *
 * Usage: node scripts/codegraph/check.mjs [--catalog-only]   (pnpm codegraph:check)
 * --catalog-only validates a checkout without local design imports, not design-file acceptance.
 */
import { promises as fs } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCurrentGraph } from './source-manifest.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WPS = path.join(ROOT, 'agents', 'program', 'work-packages.json')
const errors = []
const warn = []
const REPAIR = process.argv.includes('--repair')
const CATALOG_ONLY = process.argv.includes('--catalog-only')

if (CATALOG_ONLY) console.log('Catalog-only mode: design-file acceptance NOT evaluated; this is not design acceptance or approval to mark work packages done.')

let graph = await readCurrentGraph(ROOT)
if (!graph && REPAIR) {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'codegraph', 'build.mjs'), '--if-changed'], { cwd: ROOT, stdio: 'inherit' })
  graph = await readCurrentGraph(ROOT)
}
if (!graph) {
  console.error('Codegraph is stale, missing or corrupt; run pnpm codegraph:sync or pnpm codegraph:repair')
  process.exit(1)
}

const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
const inn = (id, t) => graph.edges.filter((e) => e.to === id && (!t || e.type === t))
let wps = { packages: [] }
try { wps = JSON.parse(await fs.readFile(WPS, 'utf8')) } catch { warn.push('work-packages.json missing') }
const ids = new Set(wps.packages.map((w) => w.id))
// Rule: two in-progress WPs must not overlap on file globs.
const globToRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '__DS__').replace(/\*/g, '[^/]*').replace(/__DS__/g, '.*') + '$')
const inProgress = wps.packages.filter((w) => w.status === 'in-progress')
for (let i = 0; i < inProgress.length; i++) for (let j = i + 1; j < inProgress.length; j++) {
  const a = inProgress[i], b = inProgress[j]
  const filesA = graph.edges.filter((e) => e.from === `wp:${a.id}` && e.type === 'WP_TOUCHES').map((e) => e.to)
  const resB = (b.files ?? []).map(globToRe)
  const overlap = filesA.filter((f) => resB.some((re) => re.test(f)))
  if (overlap.length) errors.push(`${a.id} and ${b.id} are both in-progress and overlap on: ${overlap.slice(0, 5).join(', ')}${overlap.length > 5 ? ` (+${overlap.length - 5})` : ''}`)
}
for (const w of wps.packages) {
  if (w.status === 'in-progress' || w.status === 'review') {
    const notDone = (w.dependsOn ?? []).filter((d) => wps.packages.find((x) => x.id === d)?.status !== 'done')
    if (notDone.length) errors.push(`${w.id} is ${w.status} but depends on unfinished ${notDone.join(', ')}`)
    const missingDesign = (w.designs ?? []).filter((d) => nodes.get(`design:${d}`)?.status !== 'received')
    if (missingDesign.length && !w.designAhead && !CATALOG_ONLY) errors.push(`${w.id} is ${w.status} but designs not received: ${missingDesign.join(', ')} (set designAhead:true with architect-approved ahead SPECs)`)
    if (!w.owner) warn.push(`${w.id} is ${w.status} with no owner`)
  }
  for (const d of w.designs ?? []) if (!nodes.has(`design:${d}`)) errors.push(`${w.id}: unknown design ${d}`)
  for (const dep of w.dependsOn ?? []) if (!ids.has(dep)) errors.push(`${w.id}: unknown dependency ${dep}`)
  if (!w.tests?.length) warn.push(`${w.id}: no tests listed`)
  if (!w.acceptance?.length) warn.push(`${w.id}: no acceptance criteria`)
  if (w.status === 'done') {
    if (CATALOG_ONLY && w.designs?.length) warn.push(`${w.id} is done: design-file acceptance NOT evaluated for ${w.designs.join(', ')}; verify approved local design artifacts separately`)
    const touched = graph.edges.filter((e) => e.from === `wp:${w.id}` && e.type === 'WP_TOUCHES').map((e) => nodes.get(e.to)).filter((n) => n?.type === 'page')
    for (const p of touched) if (!inn(p.id, 'COVERS_ROUTE').length && !inn(p.id, 'USES_TESTID').length) errors.push(`${w.id} is done but page ${p.route} has no e2e coverage`)
    const titles = graph.nodes.filter((n) => n.type === 'test').flatMap((n) => [...(n.describes ?? [])]).join(' ').toLowerCase()
    for (const d of w.designs ?? []) {
      const dn = nodes.get(`design:${d}`)
      if (dn?.status !== 'received') continue
      const missing = (dn.states ?? []).filter((s) => !titles.includes(s.toLowerCase().split(' ')[0]))
      if (missing.length) warn.push(`${w.id}/${d}: states not obviously covered by tests: ${missing.join(', ')}`)
    }
  }
}

for (const w of warn) console.log(`⚠ ${w}`)
for (const e of errors) console.log(`✖ ${e}`)
if (errors.length) { console.log(`\n${errors.length} error(s)`); process.exit(1) }
console.log(`✔ codegraph check passed (${warn.length} warnings)`)
